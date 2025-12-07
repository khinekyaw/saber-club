import * as THREE from "three"
import { CONFIG } from "./config.js"

export class Fighter {
  constructor(scene, color, isPlayer = false) {
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
