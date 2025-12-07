import * as THREE from "three"
import { CONFIG } from "./config.js"
import { state, aiState, gameMode, gameStarted } from "./state.js"
import { createSparks } from "./physics.js"
import { audioSystem } from "./audio.js"
import { updateHealthBars } from "./player.js"
import { showGameOver } from "./collision.js"

export const NetworkManager = {
  socket: null,
  connected: false,
  roomCode: null,
  playerId: null,
  isHost: false,
  opponentName: "Opponent",
  lastPing: 0,
  pingInterval: null,
  remoteState: {
    position: { x: 0, y: 0, z: -3 },
    rotation: 0,
    saberRotation: { x: 0, y: 0 },
    saberOn: true,
    health: 100,
  },
  remoteStateBuffer: [],
  startGameCallback: null,

  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(CONFIG.network.serverUrl)
        this.socket.onopen = () => {
          this.connected = true
          this.updateConnectionStatus(true)
          this.startPingInterval()
          resolve()
        }
        this.socket.onclose = () => {
          this.connected = false
          this.updateConnectionStatus(false)
          this.stopPingInterval()
          if (gameMode === "pvp" && gameStarted) this.handleDisconnect()
        }
        this.socket.onerror = (e) => {
          this.connected = false
          this.updateConnectionStatus(false)
          reject(e)
        }
        this.socket.onmessage = (e) =>
          this.handleMessage(JSON.parse(e.data))
      } catch (e) {
        reject(e)
      }
    })
  },

  disconnect() {
    if (this.socket) this.socket.close()
    this.socket = null
    this.connected = false
    this.roomCode = null
    this.playerId = null
    this.stopPingInterval()
  },

  send(type, data = {}) {
    if (this.socket && this.connected)
      this.socket.send(
        JSON.stringify({
          type,
          playerId: this.playerId,
          roomCode: this.roomCode,
          timestamp: Date.now(),
          ...data,
        })
      )
  },

  handleMessage(msg) {
    switch (msg.type) {
      case "connected":
        this.playerId = msg.playerId
        break
      case "room_created":
        this.roomCode = msg.roomCode
        this.isHost = true
        document.getElementById("room-code-input").value = msg.roomCode
        document.getElementById(
          "lobby-status"
        ).textContent = `Room: ${msg.roomCode} - Waiting...`
        document.getElementById("waiting-spinner").classList.add("show")
        break
      case "room_joined":
        this.roomCode = msg.roomCode
        this.isHost = false
        document.getElementById(
          "lobby-status"
        ).textContent = `Joined: ${msg.roomCode}`
        break
      case "opponent_joined":
        this.opponentName = msg.opponentName || "Opponent"
        document.getElementById(
          "opponent-info"
        ).textContent = `Opponent: ${this.opponentName}`
        document.getElementById("opponent-info").classList.add("show")
        document
          .getElementById("waiting-spinner")
          .classList.remove("show")
        document.getElementById("lobby-status").textContent =
          "Starting..."
        setTimeout(() => this.startPVPMatch(), 2000)
        break
      case "opponent_left":
        if (gameStarted) showGameOver(true, "Opponent left")
        else {
          document.getElementById("lobby-status").textContent =
            "Opponent left. Waiting..."
          document
            .getElementById("opponent-info")
            .classList.remove("show")
          document.getElementById("waiting-spinner").classList.add("show")
        }
        break
      case "game_start":
        this.startPVPMatch()
        break
      case "player_state":
        this.remoteStateBuffer.push({
          ...msg.state,
          timestamp: msg.timestamp,
        })
        this.remoteStateBuffer = this.remoteStateBuffer.filter(
          (s) => s.timestamp > Date.now() - 1000
        )
        break
      case "player_hit":
        this.handleRemoteHit(msg.damage, msg.partName)
        break
      case "saber_clash":
        this.handleRemoteClash(msg.position)
        break
      case "player_damaged":
        state.enemyHealth = msg.newHealth
        updateHealthBars()
        if (msg.newHealth <= 0) showGameOver(true)
        break
      case "game_over":
        showGameOver(msg.winner === this.playerId)
        break
      case "pong":
        this.lastPing = Date.now() - msg.clientTimestamp
        document.getElementById(
          "ping-display"
        ).textContent = `PING: ${this.lastPing}ms`
        break
      case "error":
        document.getElementById(
          "lobby-status"
        ).textContent = `Error: ${msg.message}`
        document
          .getElementById("waiting-spinner")
          .classList.remove("show")
        break
    }
  },

  createRoom() {
    this.send("create_room", {
      playerName: "Player" + Math.floor(Math.random() * 1000),
    })
  },
  joinRoom(code) {
    this.send("join_room", {
      roomCode: code.toUpperCase(),
      playerName: "Player" + Math.floor(Math.random() * 1000),
    })
  },
  sendPlayerState(camera) {
    if (!this.connected || !gameStarted) return
    this.send("player_state", {
      state: {
        position: {
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z,
        },
        rotation: camera.rotation.y,
        saberRotation: {
          x: state.saberRotation.x,
          y: state.saberRotation.y,
        },
        saberOn: state.playerSaberOn,
        health: state.playerHealth,
      },
    })
  },
  sendHit(damage, partName) {
    this.send("player_hit", { damage, partName })
  },
  sendClash(pos) {
    this.send("saber_clash", {
      position: { x: pos.x, y: pos.y, z: pos.z },
    })
  },
  startPVPMatch() {
    document.getElementById("pvp-lobby").classList.remove("show")
    document.getElementById("enemy-label").textContent =
      this.opponentName.toUpperCase()
    if (this.startGameCallback) this.startGameCallback("pvp")
  },

  getInterpolatedState() {
    const renderTime = Date.now() - CONFIG.network.interpolationDelay
    const buf = this.remoteStateBuffer
    if (buf.length < 2) return buf[buf.length - 1] || this.remoteState
    let older = null,
      newer = null
    for (let i = 0; i < buf.length - 1; i++) {
      if (
        buf[i].timestamp <= renderTime &&
        buf[i + 1].timestamp >= renderTime
      ) {
        older = buf[i]
        newer = buf[i + 1]
        break
      }
    }
    if (!older || !newer) return buf[buf.length - 1]
    const t =
      (renderTime - older.timestamp) / (newer.timestamp - older.timestamp)
    return {
      position: {
        x: older.position.x + (newer.position.x - older.position.x) * t,
        y: older.position.y + (newer.position.y - older.position.y) * t,
        z: older.position.z + (newer.position.z - older.position.z) * t,
      },
      rotation: older.rotation + (newer.rotation - older.rotation) * t,
      saberRotation: {
        x:
          older.saberRotation.x +
          (newer.saberRotation.x - older.saberRotation.x) * t,
        y:
          older.saberRotation.y +
          (newer.saberRotation.y - older.saberRotation.y) * t,
      },
      saberOn: newer.saberOn,
      health: newer.health,
    }
  },

  handleRemoteHit(damage, _partName, scene, camera) {
    state.playerHealth = Math.max(0, state.playerHealth - damage)
    state.enemyHits++
    document.getElementById("enemy-hits").textContent = state.enemyHits
    document.getElementById("player-hit").classList.add("show")
    setTimeout(
      () => document.getElementById("player-hit").classList.remove("show"),
      200
    )
    const hp = camera.position.clone()
    hp.y = 1.3
    createSparks(scene, hp, 0x00aaff)
    audioSystem.playHit()
    updateHealthBars()
    camera.position.x += (Math.random() - 0.5) * 0.1
    camera.position.z += (Math.random() - 0.5) * 0.1
    if (state.playerHealth <= 0) showGameOver(false)
  },

  handleRemoteClash(position, scene) {
    state.clashCount++
    document.getElementById("clash-count").textContent = state.clashCount
    document.getElementById("clash-indicator").classList.add("show")
    setTimeout(
      () =>
        document.getElementById("clash-indicator").classList.remove("show"),
      200
    )
    createSparks(scene, new THREE.Vector3(position.x, position.y, position.z), 0xffffff)
    audioSystem.playClash()
  },

  startPingInterval() {
    this.pingInterval = setInterval(
      () => this.send("ping", { clientTimestamp: Date.now() }),
      2000
    )
  },
  stopPingInterval() {
    if (this.pingInterval) clearInterval(this.pingInterval)
  },
  updateConnectionStatus(connected) {
    const el = document.getElementById("connection-status")
    el.textContent = connected ? "● CONNECTED" : "● DISCONNECTED"
    el.classList.toggle("connected", connected)
  },
  handleDisconnect() {
    showGameOver(true, "Connection lost")
  },

  updateRemotePlayer(_delta, enemy) {
    const rs = this.getInterpolatedState()
    enemy.group.position.set(rs.position.x, 0, rs.position.z)
    enemy.group.rotation.y = rs.rotation + Math.PI
    // Flip the model horizontally so saber appears on correct side
    enemy.group.scale.x = -1
    // Negate X rotation due to flipped scale, keep Z rotation normal
    enemy.saber.rotation.x = -rs.saberRotation.x
    enemy.saber.rotation.z = rs.saberRotation.y
    enemy.setSaberOn(rs.saberOn)
    const esp = enemy.getSaberPositions()
    if (aiState.lastSaberTip)
      aiState.swingSpeed = esp.tip.distanceTo(aiState.lastSaberTip)
    aiState.lastSaberTip = esp.tip.clone()
  },
}
