import * as THREE from "three"
import { CONFIG } from "./config.js"

export function createArena(scene) {
  const cfg = CONFIG.arena
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(cfg.radius, 64),
    new THREE.MeshStandardMaterial({
      color: 0x8b8b7a,
      metalness: 0.2,
      roughness: 0.9,
    })
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)
  const grid = new THREE.GridHelper(
    cfg.radius * 2,
    30,
    0x666666,
    0x999999
  )
  grid.position.y = 0.01
  scene.add(grid)
  for (let i = 0; i < cfg.pillarCount; i++) {
    const a = (i / cfg.pillarCount) * Math.PI * 2
    const p = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.4, 8, 8),
      new THREE.MeshStandardMaterial({
        color: 0xd4c5a9,
        metalness: 0.1,
        roughness: 0.7,
      })
    )
    p.position.set(
      Math.cos(a) * cfg.pillarDistance,
      4,
      Math.sin(a) * cfg.pillarDistance
    )
    p.castShadow = true
    p.receiveShadow = true
    scene.add(p)
    const l = new THREE.PointLight(0xfff4e0, 0.3, 8)
    l.position.set(
      Math.cos(a) * cfg.pillarDistance,
      7,
      Math.sin(a) * cfg.pillarDistance
    )
    scene.add(l)
  }
}
