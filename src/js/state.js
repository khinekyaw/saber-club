import * as THREE from "three"
import { CONFIG } from "./config.js"

export let gameMode = null
export let gameStarted = false

export function setGameMode(mode) {
  gameMode = mode
}

export function setGameStarted(started) {
  gameStarted = started
}

export const state = {
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
  cameraYaw: 0,
  cameraPitch: 0,
}

export const aiState = {
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

export function resetGameState(camera, enemy, isHost) {
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
  state.cameraYaw = isHost ? Math.PI : 0
  state.cameraPitch = 0
  aiState.currentAction = "idle"
  aiState.thinkTimer = 0
  aiState.saberRotation = { x: 0, y: 0 }
  aiState.isBlocked = false
  aiState.blockPushBack = { x: 0, y: 0 }
  aiState.swingSpeed = 0
  camera.position.set(0, CONFIG.player.height, isHost ? -3 : 3)
  camera.rotation.order = 'YXZ'
  camera.rotation.set(0, isHost ? Math.PI : 0, 0)
  enemy.group.position.set(0, 0, -3)
  enemy.group.rotation.set(0, 0, 0)
  enemy.parts.forEach((p) => p.material.color.setHex(0xaa2222))
  enemy.health = CONFIG.player.maxHealth
  enemy.setSaberOn(true)
  document.getElementById("player-hits").textContent = "0"
  document.getElementById("enemy-hits").textContent = "0"
  document.getElementById("clash-count").textContent = "0"
  document.getElementById("game-over-screen").classList.remove("show")
}
