import * as THREE from "three"
import { CONFIG } from "./config.js"
import { aiState, state } from "./state.js"

export function updateAI(delta, camera, enemy, player) {
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
