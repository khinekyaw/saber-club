import * as THREE from "three"
import { CONFIG } from "./config.js"

export function lineToLineCollision(p1, p2, p3, p4) {
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

export function pointToLineDistance(pt, ls, le) {
  const ln = le.clone().sub(ls),
    len = ln.length()
  ln.normalize()
  const v = pt.clone().sub(ls),
    d = Math.max(0, Math.min(len, v.dot(ln)))
  return pt.distanceTo(ls.clone().add(ln.clone().multiplyScalar(d)))
}

export function createSparks(scene, pos, color) {
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
