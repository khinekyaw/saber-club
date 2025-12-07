import * as THREE from "three"
import { CONFIG } from "./config.js"
import { state, setGameMode, setGameStarted, gameMode, gameStarted, resetGameState } from "./state.js"
import { audioSystem } from "./audio.js"
import { Fighter } from "./fighter.js"
import { createArena } from "./arena.js"
import { updateAI } from "./ai.js"
import { updatePlayer, updateSaber, updateHealthBars } from "./player.js"
import { checkCollisions } from "./collision.js"
import { NetworkManager } from "./network.js"
import { setupInputHandlers, setupUIEventHandlers, setupWindowResize } from "./ui.js"

let scene, camera, renderer, player, enemy
let networkUpdateInterval = null

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
  camera.rotation.order = 'YXZ'
  camera.rotation.set(0, 0, 0)
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.shadowMap.enabled = true
  document
    .getElementById("game-container")
    .appendChild(renderer.domElement)
  scene.add(new THREE.AmbientLight(0xffffff, 0.6))
  const sun = new THREE.DirectionalLight(0xfff8dc, 1.2)
  sun.position.set(10, 20, 10)
  sun.castShadow = true
  sun.shadow.mapSize.width = 2048
  sun.shadow.mapSize.height = 2048
  sun.shadow.camera.near = 0.5
  sun.shadow.camera.far = 50
  scene.add(sun)
  createArena(scene)
}

function createFighters() {
  player = new Fighter(scene, CONFIG.saber.playerColor, true)
  player.group.position.set(0, 0, 3)
  player.group.visible = false
  enemy = new Fighter(scene, CONFIG.saber.enemyColor, false)
  enemy.group.position.set(10, 0, -3)
  player.saber.position.set(0.3, -0.3, -0.5)
  player.group.remove(player.saber)
  camera.add(player.saber)
  scene.add(camera)
}

function startGame(mode) {
  setGameMode(mode)
  setGameStarted(true)
  document.getElementById("main-menu").classList.add("hidden")
  document.getElementById("ui-overlay").classList.add("show")
  document.getElementById("game-mode-label").textContent =
    mode === "pvp" ? "PVP ONLINE" : "SOLO VS AI"
  resetGameState(camera, enemy, NetworkManager.isHost)
  player.setSaberOn(true)
  updateHealthBars()

  // Request pointer lock for FPS controls
  document.body.requestPointerLock()

  if (mode === "pvp")
    networkUpdateInterval = setInterval(
      () => NetworkManager.sendPlayerState(camera),
      CONFIG.network.updateRate
    )
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
    updatePlayer(delta, camera, player)
    updateSaber(delta, player)
    if (gameMode === "solo") updateAI(delta, camera, enemy, player)
    else if (gameMode === "pvp") NetworkManager.updateRemotePlayer(delta, enemy)
    checkCollisions(scene, camera, player, enemy, NetworkManager)
  }
  renderer.render(scene, camera)
}

// Initialize
initThreeJS()
createFighters()

// Store camera globally for mouse move handler
window.camera = camera

NetworkManager.startGameCallback = startGame
setupInputHandlers(player)
setupUIEventHandlers(startGame, camera, enemy, player)
setupWindowResize(camera, renderer)
setTimeout(() => audioSystem.init(), 500)
animate(0)

export { networkUpdateInterval }
