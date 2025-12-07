import { state, setGameStarted, setGameMode, gameMode } from "./state.js"
import { audioSystem } from "./audio.js"
import { NetworkManager } from "./network.js"
import { togglePlayerSaber, updateHealthBars } from "./player.js"
import { resetGameState } from "./state.js"

export function setupInputHandlers(player) {
  document.addEventListener("keydown", (e) => {
    const gameStarted = state.gameOver === false &&
                        (gameMode === "solo" || gameMode === "pvp")
    if (!gameStarted) return
    const k = e.key.toLowerCase()
    if (k in state.keys) state.keys[k] = true
    if (k === " ") {
      state.keys.space = true
      e.preventDefault()
    }
    if (e.key === "Shift") state.keys.shift = true
    if (k === "f") togglePlayerSaber(player)
    if (e.key === "Escape" && document.pointerLockElement) {
      document.exitPointerLock()
    }
  })

  document.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase()
    if (k in state.keys) state.keys[k] = false
    if (k === " ") state.keys.space = false
    if (e.key === "Shift") state.keys.shift = false
  })

  document.addEventListener("mousemove", (e) => {
    const gameStarted = state.gameOver === false &&
                        (gameMode === "solo" || gameMode === "pvp")
    if (!gameStarted) return

    if (document.pointerLockElement) {
      const camera = window.camera

      if (state.keys.shift) {
        // SHIFT pressed: Only move saber, not camera
        state.mousePosition.x = Math.max(-1, Math.min(1, state.mousePosition.x + e.movementX * 0.01))
        state.mousePosition.y = Math.max(-1, Math.min(1, state.mousePosition.y + e.movementY * 0.01))
      } else {
        // SHIFT not pressed: Only rotate camera, keep saber centered
        state.mousePosition.x = 0
        state.mousePosition.y = 0

        if (camera) {
          // Update yaw and pitch separately to avoid gimbal lock
          state.cameraYaw -= e.movementX * 0.002
          state.cameraPitch -= e.movementY * 0.002

          // Clamp pitch to prevent flipping
          state.cameraPitch = Math.max(
            -Math.PI / 2,
            Math.min(Math.PI / 2, state.cameraPitch)
          )

          // Apply rotations in the correct order
          camera.rotation.order = 'YXZ'
          camera.rotation.y = state.cameraYaw
          camera.rotation.x = state.cameraPitch
          camera.rotation.z = 0
        }
      }
    } else {
      // Fallback to screen position if not in pointer lock
      const cx = window.innerWidth / 2,
        cy = window.innerHeight / 2
      state.mousePosition.x = Math.max(-1, Math.min(1, (e.clientX - cx) / cx))
      state.mousePosition.y = Math.max(-1, Math.min(1, (e.clientY - cy) / cy))
    }
  })

  // Request pointer lock when clicking on the game container
  document.getElementById("game-container").addEventListener("click", () => {
    const gameStarted = state.gameOver === false &&
                        (gameMode === "solo" || gameMode === "pvp")
    if (gameStarted && !document.pointerLockElement) {
      document.body.requestPointerLock()
    }
  })
}

export function setupUIEventHandlers(startGameCallback, camera, enemy, player) {
  document.getElementById("btn-solo").addEventListener("click", () => {
    document.getElementById("enemy-label").textContent = "ENEMY AI"
    startGameCallback("solo")
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
    resetGameState(camera, enemy, NetworkManager.isHost)
    player.setSaberOn(true)
    updateHealthBars()
  })

  document.getElementById("menu-btn").addEventListener("click", () => {
    NetworkManager.disconnect()
    setGameStarted(false)
    setGameMode(null)
    document.getElementById("game-over-screen").classList.remove("show")
    document.getElementById("ui-overlay").classList.remove("show")
    document.getElementById("main-menu").classList.remove("hidden")
  })
}

export function setupWindowResize(camera, renderer) {
  window.addEventListener("resize", () => {
    if (camera && renderer) {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
  })
}
