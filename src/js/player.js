import * as THREE from "three"
import { CONFIG } from "./config.js"
import { state } from "./state.js"
import { audioSystem } from "./audio.js"

export function updatePlayer(delta, camera, player) {
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

export function updateSaber(delta, player) {
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

export function togglePlayerSaber(player) {
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

export function updateHealthBars() {
  document.getElementById("player-health-fill").style.width =
    (state.playerHealth / CONFIG.player.maxHealth) * 100 + "%"
  document.getElementById("enemy-health-fill").style.width =
    (state.enemyHealth / CONFIG.player.maxHealth) * 100 + "%"
}
