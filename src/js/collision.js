import * as THREE from "three"
import { CONFIG } from "./config.js"
import { state, aiState, gameMode } from "./state.js"
import { lineToLineCollision, pointToLineDistance, createSparks } from "./physics.js"
import { audioSystem } from "./audio.js"
import { updateHealthBars } from "./player.js"

export function showGameOver(won, msg = null) {
  state.gameOver = true
  const scr = document.getElementById("game-over-screen"),
    txt = document.getElementById("game-over-text")
  txt.textContent = msg || (won ? "YOU WIN!" : "GAME OVER")
  txt.className = won ? "win" : "lose"
  scr.classList.add("show")
}

export function checkCollisions(scene, camera, player, enemy, NetworkManager) {
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
        createSparks(scene, col.closestOnPlayer, 0xffffff)
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
        createSparks(scene, pp, 0xff3300)
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
        createSparks(scene, pp, 0x00aaff)
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
