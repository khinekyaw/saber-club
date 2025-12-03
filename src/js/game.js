// ============== CONFIG ==============
const CONFIG = {
  player: {
    height: 1.7,
    moveSpeed: 5,
    jumpForce: 5,
    gravity: 15,
    turnSpeed: 2,
    maxHealth: 100,
  },
  saber: {
    bladeLength: 1.2,
    bladeRadius: 0.015,
    glowRadius: 0.035,
    hiltLength: 0.3,
    playerColor: 0x00aaff,
    enemyColor: 0xff3333,
    lightIntensity: 2,
    lightDistance: 3,
    rotationSmoothing: 12,
    maxTiltAngle: Math.PI / 2.5,
    maxSwingAngle: Math.PI / 3,
  },
  combat: {
    minSwingSpeed: 0.02,
    clashDistance: 0.12,
    hitRadius: 0.08,
    damage: 10,
    blockThreshold: 0.15,
  },
  camera: { fov: 75, near: 0.1, far: 1000, mouseSensitivity: 0.002 },
  arena: {
    radius: 15,
    pillarCount: 8,
    pillarDistance: 12,
    backgroundColor: 0x050510,
    fogDensity: 0.02,
  },
  physics: { sparkCount: 20, sparkLifetime: 1 },
  ai: {
    reactionTime: 0.3,
    aggressiveness: 0.6,
    blockSkill: 0.7,
    attackRange: 2.5,
    preferredDistance: 1.8,
    moveSpeed: 3,
    turnSpeed: 3,
  },
  network: {
    serverUrl: "ws://localhost:3000",
    updateRate: 50,
    interpolationDelay: 100,
  },
}

let gameMode = null,
  gameStarted = false

// ============== NETWORK MANAGER ==============
const NetworkManager = {
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
        handleRemoteHit(msg.damage, msg.partName)
        break
      case "saber_clash":
        handleRemoteClash(msg.position)
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
  sendPlayerState() {
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
    startGame("pvp")
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
}

let networkUpdateInterval = null

// ============== GAME STATE ==============
const state = {
  keys: {
    w: false,
    a: false,
    s: false,
    d: false,
    space: false,
    q: false,
    e: false,
    shift: false,
  },
  mousePosition: { x: 0, y: 0 },
  playerVelocity: new THREE.Vector3(),
  isJumping: false,
  saberRotation: { x: 0, y: 0 },
  targetSaberRotation: { x: 0, y: 0 },
  lastSaberTip: null,
  swingSpeed: 0,
  playerHits: 0,
  enemyHits: 0,
  clashCount: 0,
  isBlocked: false,
  blockTime: 0,
  blockPushBack: { x: 0, y: 0 },
  playerSaberOn: true,
  enemySaberOn: true,
  playerHealth: CONFIG.player.maxHealth,
  enemyHealth: CONFIG.player.maxHealth,
  gameOver: false,
}
const aiState = {
  currentAction: "idle",
  thinkTimer: 0,
  saberRotation: { x: 0, y: 0 },
  targetSaberRotation: { x: 0, y: 0 },
  lastSaberTip: null,
  swingSpeed: 0,
  isBlocked: false,
  blockTime: 0,
  blockPushBack: { x: 0, y: 0 },
  attackTime: 0,
  swingDirection: 1,
  comboCount: 0,
}

// ============== AUDIO ==============
const audioSystem = {
  ctx: null,
  musicPlaying: false,
  sfxEnabled: true,
  bgMusic: null,
  init() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)()
  },
  playSaberIgnite() {
    if (!this.sfxEnabled || !this.ctx) return
    const o = this.ctx.createOscillator(),
      g = this.ctx.createGain()
    o.type = "sawtooth"
    o.frequency.setValueAtTime(100, this.ctx.currentTime)
    o.frequency.exponentialRampToValueAtTime(
      200,
      this.ctx.currentTime + 0.3
    )
    g.gain.setValueAtTime(0.3, this.ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5)
    o.connect(g)
    g.connect(this.ctx.destination)
    o.start()
    o.stop(this.ctx.currentTime + 0.5)
  },
  playSaberRetract() {
    if (!this.sfxEnabled || !this.ctx) return
    const o = this.ctx.createOscillator(),
      g = this.ctx.createGain()
    o.type = "sawtooth"
    o.frequency.setValueAtTime(200, this.ctx.currentTime)
    o.frequency.exponentialRampToValueAtTime(
      50,
      this.ctx.currentTime + 0.3
    )
    g.gain.setValueAtTime(0.3, this.ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.4)
    o.connect(g)
    g.connect(this.ctx.destination)
    o.start()
    o.stop(this.ctx.currentTime + 0.4)
  },
  playClash() {
    if (!this.sfxEnabled || !this.ctx) return
    const buf = this.ctx.createBuffer(
        1,
        this.ctx.sampleRate * 0.1,
        this.ctx.sampleRate
      ),
      d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++)
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length * 0.1))
    const n = this.ctx.createBufferSource()
    n.buffer = buf
    const f = this.ctx.createBiquadFilter()
    f.type = "bandpass"
    f.frequency.setValueAtTime(2000, this.ctx.currentTime)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.4, this.ctx.currentTime)
    n.connect(f)
    f.connect(g)
    g.connect(this.ctx.destination)
    n.start()
  },
  playHit() {
    if (!this.sfxEnabled || !this.ctx) return
    const o = this.ctx.createOscillator(),
      g = this.ctx.createGain()
    o.type = "sawtooth"
    o.frequency.setValueAtTime(150, this.ctx.currentTime)
    o.frequency.exponentialRampToValueAtTime(
      50,
      this.ctx.currentTime + 0.2
    )
    g.gain.setValueAtTime(0.4, this.ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3)
    o.connect(g)
    g.connect(this.ctx.destination)
    o.start()
    o.stop(this.ctx.currentTime + 0.3)
  },
  startMusic() {
    if (!this.ctx) this.init()
    if (this.musicPlaying) return
    this.musicPlaying = true
    this.bgMusic = { oscillators: [], gains: [] }
    ;[55, 82.5, 110, 165].forEach((freq, i) => {
      const o = this.ctx.createOscillator(),
        g = this.ctx.createGain(),
        f = this.ctx.createBiquadFilter()
      o.type = i < 2 ? "sine" : "triangle"
      o.frequency.setValueAtTime(freq, this.ctx.currentTime)
      f.type = "lowpass"
      f.frequency.setValueAtTime(400 + i * 100, this.ctx.currentTime)
      g.gain.setValueAtTime(0, this.ctx.currentTime)
      g.gain.linearRampToValueAtTime(
        0.08 - i * 0.015,
        this.ctx.currentTime + 2
      )
      o.connect(f)
      f.connect(g)
      g.connect(this.ctx.destination)
      o.start()
      this.bgMusic.oscillators.push(o)
      this.bgMusic.gains.push(g)
    })
  },
  stopMusic() {
    if (!this.musicPlaying || !this.bgMusic) return
    this.bgMusic.gains.forEach((g) =>
      g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1)
    )
    setTimeout(() => {
      if (this.bgMusic) {
        this.bgMusic.oscillators.forEach((o) => o.stop())
        this.bgMusic = null
      }
    }, 1100)
    this.musicPlaying = false
  },
  toggleMusic() {
    if (this.musicPlaying) this.stopMusic()
    else this.startMusic()
    return this.musicPlaying
  },
  toggleSFX() {
    this.sfxEnabled = !this.sfxEnabled
    return this.sfxEnabled
  },
}

// ============== THREE.JS ==============
let scene, camera, renderer, player, enemy

function initThreeJS() {
  scene = new THREE.Scene()
  scene.background = new THREE.Color(CONFIG.arena.backgroundColor)
  scene.fog = new THREE.FogExp2(
    CONFIG.arena.backgroundColor,
    CONFIG.arena.fogDensity
  )
  camera = new THREE.PerspectiveCamera(
    CONFIG.camera.fov,
    window.innerWidth / window.innerHeight,
    CONFIG.camera.near,
    CONFIG.camera.far
  )
  camera.position.set(0, CONFIG.player.height, 3)
  camera.rotation.set(0, 0, 0) // hereØ
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.shadowMap.enabled = true
  document
    .getElementById("game-container")
    .appendChild(renderer.domElement)
  scene.add(new THREE.AmbientLight(0x111122, 0.5))
  const spot = new THREE.SpotLight(0xffffff, 0.8)
  spot.position.set(0, 20, 0)
  spot.castShadow = true
  scene.add(spot)
  createArena()
}

class Fighter {
  constructor(color, isPlayer = false) {
    this.isPlayer = isPlayer
    this.color = color
    this.group = new THREE.Group()
    this.parts = []
    this.health = CONFIG.player.maxHealth
    this.saberOn = true
    this.createBody()
    this.createSaber()
    scene.add(this.group)
  }
  createBody() {
    const mat = new THREE.MeshStandardMaterial({
      color: this.isPlayer ? 0x2244aa : 0xaa2222,
      metalness: 0.3,
      roughness: 0.7,
    })
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.7, 0.3),
      mat.clone()
    )
    torso.position.y = 1.2
    torso.userData = { partName: "torso", damage: 15 }
    this.group.add(torso)
    this.parts.push(torso)
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 16, 16),
      mat.clone()
    )
    head.position.y = 1.75
    head.userData = { partName: "head", damage: 25 }
    this.group.add(head)
    this.parts.push(head)
    const armG = new THREE.CylinderGeometry(0.06, 0.05, 0.5, 8)
    const lArm = new THREE.Mesh(armG, mat.clone())
    lArm.position.set(-0.35, 1.3, 0)
    lArm.rotation.z = Math.PI / 6
    lArm.userData = { partName: "leftArm", damage: 10 }
    this.group.add(lArm)
    this.parts.push(lArm)
    const rArm = new THREE.Mesh(armG, mat.clone())
    rArm.position.set(0.35, 1.3, 0)
    rArm.rotation.z = -Math.PI / 6
    rArm.userData = { partName: "rightArm", damage: 10 }
    this.group.add(rArm)
    this.parts.push(rArm)
    const legG = new THREE.CylinderGeometry(0.07, 0.06, 0.7, 8)
    const lLeg = new THREE.Mesh(legG, mat.clone())
    lLeg.position.set(-0.12, 0.5, 0)
    lLeg.userData = { partName: "leftLeg", damage: 10 }
    this.group.add(lLeg)
    this.parts.push(lLeg)
    const rLeg = new THREE.Mesh(legG, mat.clone())
    rLeg.position.set(0.12, 0.5, 0)
    rLeg.userData = { partName: "rightLeg", damage: 10 }
    this.group.add(rLeg)
    this.parts.push(rLeg)
  }
  createSaber() {
    const cfg = CONFIG.saber
    this.saber = new THREE.Group()
    const hilt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.03, cfg.hiltLength, 16),
      new THREE.MeshStandardMaterial({
        color: 0x333333,
        metalness: 0.9,
        roughness: 0.2,
      })
    )
    this.saber.add(hilt)
    this.blade = new THREE.Mesh(
      new THREE.CylinderGeometry(
        cfg.bladeRadius,
        cfg.bladeRadius,
        cfg.bladeLength,
        16
      ),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    )
    this.blade.position.y = cfg.hiltLength / 2 + cfg.bladeLength / 2
    this.saber.add(this.blade)
    this.glow = new THREE.Mesh(
      new THREE.CylinderGeometry(
        cfg.glowRadius,
        cfg.glowRadius,
        cfg.bladeLength,
        16
      ),
      new THREE.MeshBasicMaterial({
        color: this.color,
        transparent: true,
        opacity: 0.9,
      })
    )
    this.glow.position.y = cfg.hiltLength / 2 + cfg.bladeLength / 2
    this.saber.add(this.glow)
    this.tip = new THREE.Mesh(
      new THREE.SphereGeometry(cfg.glowRadius, 16, 8),
      new THREE.MeshBasicMaterial({
        color: this.color,
        transparent: true,
        opacity: 0.9,
      })
    )
    this.tip.position.y =
      cfg.hiltLength / 2 + cfg.bladeLength + cfg.glowRadius / 2
    this.saber.add(this.tip)
    this.saberLight = new THREE.PointLight(
      this.color,
      cfg.lightIntensity,
      cfg.lightDistance
    )
    this.saberLight.position.y = cfg.hiltLength / 2 + cfg.bladeLength / 2
    this.saber.add(this.saberLight)
    this.saber.position.set(0.4, 1.1, 0.3)
    this.group.add(this.saber)
  }
  setSaberOn(on) {
    this.saberOn = on
    this.blade.visible = on
    this.glow.visible = on
    this.tip.visible = on
    this.saberLight.visible = on
  }
  getSaberPositions() {
    const cfg = CONFIG.saber
    const tipL = new THREE.Vector3(
        0,
        cfg.hiltLength / 2 + cfg.bladeLength + cfg.glowRadius / 2,
        0
      ),
      tipW = tipL.clone()
    this.saber.localToWorld(tipW)
    const baseL = new THREE.Vector3(0, cfg.hiltLength / 2, 0),
      baseW = baseL.clone()
    this.saber.localToWorld(baseW)
    return { tip: tipW, base: baseW }
  }
  takeDamage(amt) {
    this.health = Math.max(0, this.health - amt)
    this.parts.forEach((p) => {
      const c = p.material.color.getHex()
      p.material.color.setHex(0xff0000)
      setTimeout(() => p.material.color.setHex(c), 100)
    })
    return this.health <= 0
  }
}

function createArena() {
  const cfg = CONFIG.arena
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(cfg.radius, 64),
    new THREE.MeshStandardMaterial({
      color: 0x111115,
      metalness: 0.5,
      roughness: 0.8,
    })
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)
  const grid = new THREE.GridHelper(
    cfg.radius * 2,
    30,
    0x222233,
    0x111122
  )
  grid.position.y = 0.01
  scene.add(grid)
  for (let i = 0; i < cfg.pillarCount; i++) {
    const a = (i / cfg.pillarCount) * Math.PI * 2
    const p = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.4, 8, 8),
      new THREE.MeshStandardMaterial({
        color: 0x222233,
        metalness: 0.7,
        roughness: 0.3,
      })
    )
    p.position.set(
      Math.cos(a) * cfg.pillarDistance,
      4,
      Math.sin(a) * cfg.pillarDistance
    )
    scene.add(p)
    const l = new THREE.PointLight(0x3333ff, 0.5, 5)
    l.position.set(
      Math.cos(a) * cfg.pillarDistance,
      7,
      Math.sin(a) * cfg.pillarDistance
    )
    scene.add(l)
  }
}

function lineToLineCollision(p1, p2, p3, p4) {
  const d1 = p2.clone().sub(p1),
    d2 = p4.clone().sub(p3),
    r = p1.clone().sub(p3)
  const a = d1.dot(d1),
    e = d2.dot(d2),
    f = d2.dot(r),
    b = d1.dot(d2),
    c = d1.dot(r),
    denom = a * e - b * b
  let s =
      denom !== 0 ? Math.max(0, Math.min(1, (b * f - c * e) / denom)) : 0,
    t = (b * s + f) / e
  if (t < 0) {
    t = 0
    s = Math.max(0, Math.min(1, -c / a))
  } else if (t > 1) {
    t = 1
    s = Math.max(0, Math.min(1, (b - c) / a))
  }
  const c1 = p1.clone().add(d1.clone().multiplyScalar(s)),
    c2 = p3.clone().add(d2.clone().multiplyScalar(t))
  return {
    distance: c1.distanceTo(c2),
    closestOnPlayer: c1,
    closestOnEnemy: c2,
  }
}
function pointToLineDistance(pt, ls, le) {
  const ln = le.clone().sub(ls),
    len = ln.length()
  ln.normalize()
  const v = pt.clone().sub(ls),
    d = Math.max(0, Math.min(len, v.dot(ln)))
  return pt.distanceTo(ls.clone().add(ln.clone().multiplyScalar(d)))
}
function createSparks(pos, color) {
  const sparks = []
  for (let i = 0; i < CONFIG.physics.sparkCount; i++) {
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 4, 4),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
      })
    )
    s.position.copy(pos)
    s.userData = {
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 5
      ),
      life: CONFIG.physics.sparkLifetime,
    }
    scene.add(s)
    sparks.push(s)
  }
  const anim = () => {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]
      s.position.add(s.userData.velocity.clone().multiplyScalar(0.016))
      s.userData.velocity.y -= 0.1
      s.userData.life -= 0.05
      s.material.opacity = s.userData.life
      if (s.userData.life <= 0) {
        scene.remove(s)
        sparks.splice(i, 1)
      }
    }
    if (sparks.length > 0) requestAnimationFrame(anim)
  }
  anim()
}

function createFighters() {
  player = new Fighter(CONFIG.saber.playerColor, true)
  player.group.position.set(0, 0, 3)
  player.group.visible = false
  enemy = new Fighter(CONFIG.saber.enemyColor, false)
  enemy.group.position.set(10, 0, -3)
  player.saber.position.set(0.3, -0.3, -0.5)
  player.group.remove(player.saber)
  camera.add(player.saber)
  scene.add(camera)
}
function startGame(mode) {
  gameMode = mode
  gameStarted = true
  document.getElementById("main-menu").classList.add("hidden")
  document.getElementById("ui-overlay").classList.add("show")
  document.getElementById("game-mode-label").textContent =
    mode === "pvp" ? "PVP ONLINE" : "SOLO VS AI"
  resetGameState()
  if (mode === "pvp")
    networkUpdateInterval = setInterval(
      () => NetworkManager.sendPlayerState(),
      CONFIG.network.updateRate
    )
}
function resetGameState() {
  state.playerHealth = CONFIG.player.maxHealth
  state.enemyHealth = CONFIG.player.maxHealth
  state.playerHits = 0
  state.enemyHits = 0
  state.clashCount = 0
  state.gameOver = false
  state.isBlocked = false
  state.blockPushBack = { x: 0, y: 0 }
  state.playerSaberOn = true
  state.saberRotation = { x: 0, y: 0 }
  aiState.currentAction = "idle"
  aiState.thinkTimer = 0
  aiState.saberRotation = { x: 0, y: 0 }
  aiState.isBlocked = false
  aiState.blockPushBack = { x: 0, y: 0 }
  aiState.swingSpeed = 0
  camera.position.set(
    0,
    CONFIG.player.height,
    NetworkManager.isHost ? -3 : 3
  )
  camera.rotation.set(0, NetworkManager.isHost ? Math.PI : 0, 0) // here
  enemy.group.position.set(0, 0, -3)
  enemy.group.rotation.set(0, 0, 0)
  enemy.parts.forEach((p) => p.material.color.setHex(0xaa2222))
  enemy.health = CONFIG.player.maxHealth
  enemy.setSaberOn(true)
  player.setSaberOn(true)
  document.getElementById("player-hits").textContent = "0"
  document.getElementById("enemy-hits").textContent = "0"
  document.getElementById("clash-count").textContent = "0"
  updateHealthBars()
  document.getElementById("game-over-screen").classList.remove("show")
}

function updateAI(delta) {
  if (gameMode !== "solo") return
  const ai = CONFIG.ai,
    playerPos = camera.position.clone(),
    enemyPos = enemy.group.position.clone(),
    toPlayer = playerPos.clone().sub(enemyPos),
    dist = toPlayer.length()
  toPlayer.normalize()
  aiState.thinkTimer -= delta
  if (aiState.thinkTimer <= 0) {
    aiState.thinkTimer = ai.reactionTime * (0.5 + Math.random() * 0.5)
    if (dist > ai.attackRange * 1.2) aiState.currentAction = "approach"
    else if (dist < ai.preferredDistance * 0.6)
      aiState.currentAction = "retreat"
    else if (dist <= ai.attackRange) {
      if (
        state.swingSpeed > CONFIG.combat.minSwingSpeed &&
        Math.random() < ai.blockSkill
      )
        aiState.currentAction = "block"
      else if (Math.random() < ai.aggressiveness) {
        aiState.currentAction = "attack"
        aiState.attackTime = 0
        aiState.swingDirection = Math.random() < 0.5 ? 1 : -1
        aiState.comboCount = Math.floor(Math.random() * 3) + 1
      } else aiState.currentAction = "strafe"
    } else
      aiState.currentAction = Math.random() < 0.3 ? "strafe" : "approach"
  }
  const moveDir = new THREE.Vector3()
  switch (aiState.currentAction) {
    case "approach":
      moveDir.copy(toPlayer)
      aiState.targetSaberRotation.x = -0.2
      aiState.targetSaberRotation.y = 0.3 * aiState.swingDirection
      break
    case "retreat":
      moveDir.copy(toPlayer).negate()
      aiState.targetSaberRotation.x = 0
      aiState.targetSaberRotation.y = 0
      break
    case "strafe":
      moveDir
        .set(-toPlayer.z, 0, toPlayer.x)
        .multiplyScalar(aiState.swingDirection)
      aiState.targetSaberRotation.x = -0.1
      aiState.targetSaberRotation.y = 0.2 * aiState.swingDirection
      break
    case "attack":
      aiState.attackTime += delta
      const swD = 0.25,
        wuD = 0.15,
        rcD = 0.2,
        tot = wuD + swD + rcD,
        pt = aiState.attackTime % tot
      if (pt < wuD) {
        const t = pt / wuD
        aiState.targetSaberRotation.x = -0.5 - t * 0.3
        aiState.targetSaberRotation.y =
          aiState.swingDirection * (0.8 + t * 0.4)
      } else if (pt < wuD + swD) {
        const t = (pt - wuD) / swD,
          e = t * t * (3 - 2 * t)
        aiState.targetSaberRotation.x = -0.8 + e * 1.4
        aiState.targetSaberRotation.y =
          aiState.swingDirection * (1.2 - e * 2.4)
      } else {
        const t = (pt - wuD - swD) / rcD
        aiState.targetSaberRotation.x = 0.6 - t * 0.8
        aiState.targetSaberRotation.y =
          aiState.swingDirection * (-1.2 + t * 1.0)
        if (t > 0.8) {
          aiState.comboCount--
          if (aiState.comboCount > 0) {
            aiState.attackTime = 0
            aiState.swingDirection *= -1
          } else {
            aiState.currentAction = "strafe"
            aiState.thinkTimer = 0.3
          }
        }
      }
      if (dist > ai.preferredDistance * 0.8)
        moveDir.copy(toPlayer).multiplyScalar(0.5)
      break
    case "block":
      const ps = player.getSaberPositions(),
        ec = enemy.group.position.clone()
      ec.y = 1.3
      const bv = ps.tip.clone().sub(ec).normalize()
      aiState.targetSaberRotation.x = Math.max(
        -0.8,
        Math.min(0.5, -Math.atan2(bv.y, 1) * 0.8)
      )
      aiState.targetSaberRotation.y = Math.max(
        -1,
        Math.min(1, Math.atan2(bv.x, bv.z) * 0.6)
      )
      break
    default:
      aiState.targetSaberRotation.x = Math.sin(Date.now() * 0.001) * 0.15
      aiState.targetSaberRotation.y = Math.cos(Date.now() * 0.0015) * 0.15
  }
  if (moveDir.length() > 0) {
    moveDir.y = 0
    moveDir.normalize()
    enemy.group.position.add(
      moveDir.multiplyScalar(
        (aiState.currentAction === "attack"
          ? ai.moveSpeed * 0.6
          : ai.moveSpeed) * delta
      )
    )
  }
  const tgtRot = Math.atan2(toPlayer.x, toPlayer.z)
  let rd = tgtRot - enemy.group.rotation.y
  while (rd > Math.PI) rd -= Math.PI * 2
  while (rd < -Math.PI) rd += Math.PI * 2
  enemy.group.rotation.y += rd * ai.turnSpeed * delta
  if (aiState.isBlocked) {
    aiState.blockTime -= delta
    if (aiState.blockTime <= 0) {
      aiState.isBlocked = false
      aiState.blockPushBack = { x: 0, y: 0 }
    }
  }
  const rs =
    aiState.currentAction === "attack"
      ? CONFIG.saber.rotationSmoothing * 2
      : CONFIG.saber.rotationSmoothing
  aiState.saberRotation.x +=
    (aiState.targetSaberRotation.x +
      aiState.blockPushBack.x -
      aiState.saberRotation.x) *
    rs *
    delta
  aiState.saberRotation.y +=
    (aiState.targetSaberRotation.y +
      aiState.blockPushBack.y -
      aiState.saberRotation.y) *
    rs *
    delta
  enemy.saber.rotation.x = aiState.saberRotation.x
  enemy.saber.rotation.z = aiState.saberRotation.y
  const bd = Math.sqrt(
    enemy.group.position.x ** 2 + enemy.group.position.z ** 2
  )
  if (bd > CONFIG.arena.radius - 1) {
    const a = Math.atan2(enemy.group.position.z, enemy.group.position.x)
    enemy.group.position.x = Math.cos(a) * (CONFIG.arena.radius - 1)
    enemy.group.position.z = Math.sin(a) * (CONFIG.arena.radius - 1)
  }
  const esp = enemy.getSaberPositions()
  if (aiState.lastSaberTip)
    aiState.swingSpeed = esp.tip.distanceTo(aiState.lastSaberTip)
  aiState.lastSaberTip = esp.tip.clone()
}

function updateRemotePlayer(delta) {
  if (gameMode !== "pvp") return
  const rs = NetworkManager.getInterpolatedState()
  enemy.group.position.set(rs.position.x, 0, rs.position.z)
  enemy.group.rotation.y = rs.rotation + Math.PI
  enemy.saber.rotation.x = rs.saberRotation.x
  enemy.saber.rotation.z = rs.saberRotation.y
  enemy.setSaberOn(rs.saberOn)
  const esp = enemy.getSaberPositions()
  if (aiState.lastSaberTip)
    aiState.swingSpeed = esp.tip.distanceTo(aiState.lastSaberTip)
  aiState.lastSaberTip = esp.tip.clone()
}
function handleRemoteHit(damage, partName) {
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
  createSparks(hp, 0x00aaff)
  audioSystem.playHit()
  updateHealthBars()
  camera.position.x += (Math.random() - 0.5) * 0.1
  camera.position.z += (Math.random() - 0.5) * 0.1
  if (state.playerHealth <= 0) showGameOver(false)
}
function handleRemoteClash(pos) {
  state.clashCount++
  document.getElementById("clash-count").textContent = state.clashCount
  document.getElementById("clash-indicator").classList.add("show")
  setTimeout(
    () =>
      document.getElementById("clash-indicator").classList.remove("show"),
    200
  )
  createSparks(new THREE.Vector3(pos.x, pos.y, pos.z), 0xffffff)
  audioSystem.playClash()
}
function togglePlayerSaber() {
  state.playerSaberOn = !state.playerSaberOn
  player.setSaberOn(state.playerSaberOn)
  const s = document.getElementById("saber-status")
  s.textContent = state.playerSaberOn
    ? "SABER IGNITED"
    : "SABER RETRACTED"
  s.style.color = state.playerSaberOn ? "#00aaff" : "#666"
  s.classList.add("show")
  setTimeout(() => s.classList.remove("show"), 1000)
  if (state.playerSaberOn) audioSystem.playSaberIgnite()
  else audioSystem.playSaberRetract()
}

// Input
document.addEventListener("keydown", (e) => {
  if (!gameStarted) return
  const k = e.key.toLowerCase()
  if (k in state.keys) state.keys[k] = true
  if (k === " ") {
    state.keys.space = true
    e.preventDefault()
  }
  if (e.key === "Shift") state.keys.shift = true
  if (k === "f") togglePlayerSaber()
})
document.addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase()
  if (k in state.keys) state.keys[k] = false
  if (k === " ") state.keys.space = false
  if (e.key === "Shift") state.keys.shift = false
})
document.addEventListener("mousemove", (e) => {
  if (!gameStarted) return
  const cx = window.innerWidth / 2,
    cy = window.innerHeight / 2
  state.mousePosition.x = Math.max(-1, Math.min(1, (e.clientX - cx) / cx))
  state.mousePosition.y = Math.max(-1, Math.min(1, (e.clientY - cy) / cy))
  if (!state.keys.shift) {
    camera.rotation.y -= e.movementX * CONFIG.camera.mouseSensitivity
    camera.rotation.x -= e.movementY * CONFIG.camera.mouseSensitivity
    camera.rotation.x = Math.max(
      -Math.PI / 2,
      Math.min(Math.PI / 2, camera.rotation.x)
    )
  }
})
document.getElementById("btn-solo").addEventListener("click", () => {
  document.getElementById("enemy-label").textContent = "ENEMY AI"
  startGame("solo")
})
document.getElementById("btn-pvp").addEventListener("click", async () => {
  document.getElementById("main-menu").classList.add("hidden")
  document.getElementById("pvp-lobby").classList.add("show")
  try {
    await NetworkManager.connect()
  } catch (e) {
    document.getElementById("lobby-status").textContent =
      "Failed to connect"
  }
})
document
  .getElementById("btn-create-room")
  .addEventListener("click", () => {
    if (NetworkManager.connected) NetworkManager.createRoom()
  })
document.getElementById("btn-join-room").addEventListener("click", () => {
  const c = document.getElementById("room-code-input").value.trim()
  if (c && NetworkManager.connected) {
    NetworkManager.joinRoom(c)
    document.getElementById("lobby-status").textContent = "Joining..."
    document.getElementById("waiting-spinner").classList.add("show")
  }
})
document.getElementById("btn-back-menu").addEventListener("click", () => {
  NetworkManager.disconnect()
  document.getElementById("pvp-lobby").classList.remove("show")
  document.getElementById("main-menu").classList.remove("hidden")
  document.getElementById("waiting-spinner").classList.remove("show")
  document.getElementById("opponent-info").classList.remove("show")
  document.getElementById("room-code-input").value = ""
  document.getElementById("lobby-status").textContent =
    "Enter a room code or create a new room"
})
document.getElementById("music-toggle").addEventListener("click", () => {
  const p = audioSystem.toggleMusic()
  document.getElementById("music-toggle").textContent = p
    ? "♪ MUSIC: ON"
    : "♪ MUSIC: OFF"
  document.getElementById("music-toggle").classList.toggle("active", p)
})
document.getElementById("sfx-toggle").addEventListener("click", () => {
  const e = audioSystem.toggleSFX()
  document.getElementById("sfx-toggle").textContent = e
    ? "🔊 SFX: ON"
    : "🔊 SFX: OFF"
  document.getElementById("sfx-toggle").classList.toggle("active", e)
})
document.getElementById("restart-btn").addEventListener("click", () => {
  if (gameMode === "pvp") NetworkManager.send("request_rematch")
  resetGameState()
})
document.getElementById("menu-btn").addEventListener("click", () => {
  if (networkUpdateInterval) {
    clearInterval(networkUpdateInterval)
    networkUpdateInterval = null
  }
  NetworkManager.disconnect()
  gameStarted = false
  gameMode = null
  document.getElementById("game-over-screen").classList.remove("show")
  document.getElementById("ui-overlay").classList.remove("show")
  document.getElementById("main-menu").classList.remove("hidden")
})
window.addEventListener("resize", () => {
  if (camera && renderer) {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  }
})

function updatePlayer(delta) {
  const cfg = CONFIG.player,
    dir = new THREE.Vector3()
  if (state.keys.w) dir.z -= 1
  if (state.keys.s) dir.z += 1
  if (state.keys.a) dir.x -= 1
  if (state.keys.d) dir.x += 1
  if (state.keys.q) camera.rotation.y += cfg.turnSpeed * delta
  if (state.keys.e) camera.rotation.y -= cfg.turnSpeed * delta
  if (dir.length() > 0) {
    dir.normalize().applyQuaternion(camera.quaternion)
    dir.y = 0
    dir.normalize()
    camera.position.add(dir.multiplyScalar(cfg.moveSpeed * delta))
  }
  if (state.keys.space && !state.isJumping) {
    state.playerVelocity.y = cfg.jumpForce
    state.isJumping = true
  }
  state.playerVelocity.y -= cfg.gravity * delta
  camera.position.y += state.playerVelocity.y * delta
  if (camera.position.y < cfg.height) {
    camera.position.y = cfg.height
    state.playerVelocity.y = 0
    state.isJumping = false
  }
  const d = Math.sqrt(camera.position.x ** 2 + camera.position.z ** 2)
  if (d > CONFIG.arena.radius - 1) {
    const a = Math.atan2(camera.position.z, camera.position.x)
    camera.position.x = Math.cos(a) * (CONFIG.arena.radius - 1)
    camera.position.z = Math.sin(a) * (CONFIG.arena.radius - 1)
  }
  player.group.position.copy(camera.position)
  player.group.position.y = 0
  player.group.rotation.y = camera.rotation.y
}
function updateSaber(delta) {
  const cfg = CONFIG.saber
  state.targetSaberRotation.x = -state.mousePosition.y * cfg.maxTiltAngle
  state.targetSaberRotation.y = -state.mousePosition.x * cfg.maxSwingAngle
  if (state.isBlocked) {
    state.blockTime -= delta
    if (state.blockTime <= 0) {
      state.isBlocked = false
      state.blockPushBack = { x: 0, y: 0 }
    }
  }
  state.saberRotation.x +=
    (state.targetSaberRotation.x +
      state.blockPushBack.x -
      state.saberRotation.x) *
    cfg.rotationSmoothing *
    delta
  state.saberRotation.y +=
    (state.targetSaberRotation.y +
      state.blockPushBack.y -
      state.saberRotation.y) *
    cfg.rotationSmoothing *
    delta
  player.saber.rotation.x = state.saberRotation.x
  player.saber.rotation.z = state.saberRotation.y
  const ps = player.getSaberPositions()
  if (state.lastSaberTip)
    state.swingSpeed = ps.tip.distanceTo(state.lastSaberTip)
  state.lastSaberTip = ps.tip.clone()
}
function updateHealthBars() {
  document.getElementById("player-health-fill").style.width =
    (state.playerHealth / CONFIG.player.maxHealth) * 100 + "%"
  document.getElementById("enemy-health-fill").style.width =
    (state.enemyHealth / CONFIG.player.maxHealth) * 100 + "%"
}

function checkCollisions() {
  if (state.gameOver) return
  const cfg = CONFIG.combat,
    psp = player.getSaberPositions(),
    esp = enemy.getSaberPositions()
  if (state.playerSaberOn && enemy.saberOn) {
    const col = lineToLineCollision(psp.base, psp.tip, esp.base, esp.tip)
    if (col.distance < cfg.blockThreshold) {
      const cl = col.closestOnPlayer.clone()
      camera.worldToLocal(cl)
      const el = col.closestOnEnemy.clone()
      camera.worldToLocal(el)
      const pd = cl.clone().sub(el).normalize(),
        ps = (cfg.blockThreshold - col.distance) * 15
      state.blockPushBack.x = Math.max(
        -Math.PI / 4,
        Math.min(Math.PI / 4, pd.y * ps)
      )
      state.blockPushBack.y = Math.max(
        -Math.PI / 4,
        Math.min(Math.PI / 4, pd.x * ps)
      )
      state.isBlocked = true
      state.blockTime = 0.1
      if (gameMode === "solo") {
        aiState.blockPushBack.x = -pd.y * ps * 0.5
        aiState.blockPushBack.y = -pd.x * ps * 0.5
        aiState.isBlocked = true
        aiState.blockTime = 0.1
      }
      if (
        col.distance < cfg.clashDistance &&
        (state.swingSpeed > cfg.minSwingSpeed * 0.5 ||
          aiState.swingSpeed > cfg.minSwingSpeed * 0.5)
      ) {
        state.clashCount++
        document.getElementById("clash-count").textContent =
          state.clashCount
        document.getElementById("clash-indicator").classList.add("show")
        setTimeout(
          () =>
            document
              .getElementById("clash-indicator")
              .classList.remove("show"),
          200
        )
        createSparks(col.closestOnPlayer, 0xffffff)
        audioSystem.playClash()
        if (gameMode === "pvp")
          NetworkManager.sendClash(col.closestOnPlayer)
        state.blockPushBack.x *= 2
        state.blockPushBack.y *= 2
        state.blockTime = 0.2
        if (gameMode === "solo") {
          aiState.blockPushBack.x *= 2
          aiState.blockPushBack.y *= 2
          aiState.blockTime = 0.2
        }
      }
      return
    }
  }
  if (state.playerSaberOn && state.swingSpeed > cfg.minSwingSpeed) {
    enemy.parts.forEach((p) => {
      const pp = new THREE.Vector3()
      p.getWorldPosition(pp)
      if (
        pointToLineDistance(pp, psp.base, psp.tip) <
        0.2 + cfg.hitRadius
      ) {
        const dmg = p.userData.damage || cfg.damage
        if (gameMode === "pvp")
          NetworkManager.sendHit(dmg, p.userData.partName)
        else {
          state.enemyHealth = Math.max(0, state.enemyHealth - dmg)
          enemy.takeDamage(dmg)
          updateHealthBars()
          if (state.enemyHealth <= 0) showGameOver(true)
        }
        state.playerHits++
        document.getElementById("player-hits").textContent =
          state.playerHits
        document.getElementById("hit-indicator").classList.add("show")
        setTimeout(
          () =>
            document
              .getElementById("hit-indicator")
              .classList.remove("show"),
          200
        )
        createSparks(pp, 0xff3300)
        audioSystem.playHit()
      }
    })
  }
  if (
    gameMode === "solo" &&
    enemy.saberOn &&
    aiState.swingSpeed > cfg.minSwingSpeed
  ) {
    player.parts.forEach((p) => {
      const pp = new THREE.Vector3()
      pp.copy(camera.position)
      pp.y = p.position.y
      if (
        pointToLineDistance(pp, esp.base, esp.tip) <
        0.25 + cfg.hitRadius
      ) {
        const dmg = p.userData.damage || cfg.damage
        state.playerHealth = Math.max(0, state.playerHealth - dmg)
        state.enemyHits++
        document.getElementById("enemy-hits").textContent =
          state.enemyHits
        document.getElementById("player-hit").classList.add("show")
        setTimeout(
          () =>
            document
              .getElementById("player-hit")
              .classList.remove("show"),
          200
        )
        createSparks(pp, 0x00aaff)
        audioSystem.playHit()
        updateHealthBars()
        camera.position.x += (Math.random() - 0.5) * 0.1
        camera.position.z += (Math.random() - 0.5) * 0.1
        if (state.playerHealth <= 0) showGameOver(false)
        aiState.swingSpeed = 0
      }
    })
  }
}

function showGameOver(won, msg = null) {
  state.gameOver = true
  const scr = document.getElementById("game-over-screen"),
    txt = document.getElementById("game-over-text")
  txt.textContent = msg || (won ? "YOU WIN!" : "GAME OVER")
  txt.className = won ? "win" : "lose"
  scr.classList.add("show")
  if (networkUpdateInterval) {
    clearInterval(networkUpdateInterval)
    networkUpdateInterval = null
  }
}

let lastTime = 0
function animate(time) {
  requestAnimationFrame(animate)
  if (!gameStarted) {
    if (renderer) renderer.render(scene, camera)
    return
  }
  const delta = Math.min((time - lastTime) / 1000, 0.1)
  lastTime = time
  if (!state.gameOver) {
    updatePlayer(delta)
    updateSaber(delta)
    if (gameMode === "solo") updateAI(delta)
    else if (gameMode === "pvp") updateRemotePlayer(delta)
    checkCollisions()
  }
  renderer.render(scene, camera)
}

initThreeJS()
createFighters()
setTimeout(() => audioSystem.init(), 500)
animate(0)
