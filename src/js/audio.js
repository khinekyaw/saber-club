export const audioSystem = {
  ctx: null,
  musicPlaying: false,
  sfxEnabled: true,
  bgMusic: null,
  init() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)()
  },
  playSaberIgnite() {
    if (!this.sfxEnabled || !this.ctx) return
    const o = this.ctx.createOscillator(),
      g = this.ctx.createGain()
    o.type = "sawtooth"
    o.frequency.setValueAtTime(100, this.ctx.currentTime)
    o.frequency.exponentialRampToValueAtTime(
      200,
      this.ctx.currentTime + 0.3
    )
    g.gain.setValueAtTime(0.3, this.ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5)
    o.connect(g)
    g.connect(this.ctx.destination)
    o.start()
    o.stop(this.ctx.currentTime + 0.5)
  },
  playSaberRetract() {
    if (!this.sfxEnabled || !this.ctx) return
    const o = this.ctx.createOscillator(),
      g = this.ctx.createGain()
    o.type = "sawtooth"
    o.frequency.setValueAtTime(200, this.ctx.currentTime)
    o.frequency.exponentialRampToValueAtTime(
      50,
      this.ctx.currentTime + 0.3
    )
    g.gain.setValueAtTime(0.3, this.ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.4)
    o.connect(g)
    g.connect(this.ctx.destination)
    o.start()
    o.stop(this.ctx.currentTime + 0.4)
  },
  playClash() {
    if (!this.sfxEnabled || !this.ctx) return
    const buf = this.ctx.createBuffer(
        1,
        this.ctx.sampleRate * 0.1,
        this.ctx.sampleRate
      ),
      d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++)
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length * 0.1))
    const n = this.ctx.createBufferSource()
    n.buffer = buf
    const f = this.ctx.createBiquadFilter()
    f.type = "bandpass"
    f.frequency.setValueAtTime(2000, this.ctx.currentTime)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.4, this.ctx.currentTime)
    n.connect(f)
    f.connect(g)
    g.connect(this.ctx.destination)
    n.start()
  },
  playHit() {
    if (!this.sfxEnabled || !this.ctx) return
    const o = this.ctx.createOscillator(),
      g = this.ctx.createGain()
    o.type = "sawtooth"
    o.frequency.setValueAtTime(150, this.ctx.currentTime)
    o.frequency.exponentialRampToValueAtTime(
      50,
      this.ctx.currentTime + 0.2
    )
    g.gain.setValueAtTime(0.4, this.ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3)
    o.connect(g)
    g.connect(this.ctx.destination)
    o.start()
    o.stop(this.ctx.currentTime + 0.3)
  },
  startMusic() {
    if (!this.ctx) this.init()
    if (this.musicPlaying) return
    this.musicPlaying = true
    this.bgMusic = { oscillators: [], gains: [] }
    ;[55, 82.5, 110, 165].forEach((freq, i) => {
      const o = this.ctx.createOscillator(),
        g = this.ctx.createGain(),
        f = this.ctx.createBiquadFilter()
      o.type = i < 2 ? "sine" : "triangle"
      o.frequency.setValueAtTime(freq, this.ctx.currentTime)
      f.type = "lowpass"
      f.frequency.setValueAtTime(400 + i * 100, this.ctx.currentTime)
      g.gain.setValueAtTime(0, this.ctx.currentTime)
      g.gain.linearRampToValueAtTime(
        0.08 - i * 0.015,
        this.ctx.currentTime + 2
      )
      o.connect(f)
      f.connect(g)
      g.connect(this.ctx.destination)
      o.start()
      this.bgMusic.oscillators.push(o)
      this.bgMusic.gains.push(g)
    })
  },
  stopMusic() {
    if (!this.musicPlaying || !this.bgMusic) return
    this.bgMusic.gains.forEach((g) =>
      g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1)
    )
    setTimeout(() => {
      if (this.bgMusic) {
        this.bgMusic.oscillators.forEach((o) => o.stop())
        this.bgMusic = null
      }
    }, 1100)
    this.musicPlaying = false
  },
  toggleMusic() {
    if (this.musicPlaying) this.stopMusic()
    else this.startMusic()
    return this.musicPlaying
  },
  toggleSFX() {
    this.sfxEnabled = !this.sfxEnabled
    return this.sfxEnabled
  },
}
