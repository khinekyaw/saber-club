import * as THREE from "three"
import { CONFIG } from "./config.js"

export function createArena(scene) {
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
