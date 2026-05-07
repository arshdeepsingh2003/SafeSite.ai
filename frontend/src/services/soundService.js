// ============================================================
// SafeSite AI — Sound Service
// File: frontend/src/services/soundService.js
//
// Generates alert sounds using the Web Audio API.
// NO external audio files needed — sounds are synthesized
// in the browser itself using oscillators.
//
// WHY WEB AUDIO API?
//   - Zero dependencies, no files to host
//   - Works in all modern browsers
//   - Sounds start instantly (no loading delay)
//
// HOW IT WORKS:
//   An AudioContext is like a tiny sound studio in the browser.
//   An OscillatorNode generates a tone at a given frequency (Hz).
//   A GainNode controls volume.
//   We connect them: Oscillator → Gain → Speakers
// ============================================================

// ── AudioContext singleton ────────────────────────────────────
// We keep ONE AudioContext for the whole app.
// Browsers only allow it to start after a user gesture
// (click, keypress, etc.) — this is the autoplay policy.
let _ctx = null

function getCtx() {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)()
  }
  return _ctx
}

// ── Core tone player ─────────────────────────────────────────
/**
 * Play a single tone.
 *
 * @param {number} frequency   - Hz (440 = A note, 880 = high A)
 * @param {number} duration    - seconds
 * @param {number} volume      - 0.0 to 1.0
 * @param {string} type        - 'sine' | 'square' | 'sawtooth' | 'triangle'
 * @param {number} startDelay  - seconds from now to start
 */
function playTone(frequency, duration, volume = 0.4, type = 'sine', startDelay = 0) {
  const ctx = getCtx()

  // Check if context is suspended (browser autoplay policy)
  if (ctx.state === 'suspended') {
    console.warn('⚠️ AudioContext is suspended. Sound will not play. Click anywhere on the page first.')
    return
  }

  const now = ctx.currentTime + startDelay

  // Oscillator — generates the raw tone
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, now)

  // Gain — controls volume with fade-in and fade-out to avoid clicks
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(volume, now + 0.01)        // 10ms fade-in
  gain.gain.setValueAtTime(volume, now + duration - 0.05)
  gain.gain.linearRampToValueAtTime(0, now + duration)         // 50ms fade-out

  // Connect: oscillator → gain → output
  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(now)
  osc.stop(now + duration)
}

// ── PUBLIC API ────────────────────────────────────────────────

/**
 * HIGH severity alarm — urgent, attention-grabbing
 * Three descending tones, like an emergency klaxon.
 *
 * Plays: 880Hz → 660Hz → 440Hz (each 0.3s, with 0.1s gap)
 */
export function playAlarm() {
  try {
    console.log('🔊 Playing alarm sound...')
    // Tone 1: high urgent beep
    playTone(880, 0.3, 0.5, 'square', 0.0)
    // Tone 2: mid beep
    playTone(660, 0.3, 0.5, 'square', 0.4)
    // Tone 3: low beep
    playTone(440, 0.4, 0.5, 'square', 0.8)
  } catch (err) {
    console.warn('Could not play alarm sound:', err)
  }
}

/**
 * MEDIUM severity beep — softer, less urgent
 * A single short beep, like a notification.
 *
 * Plays: 600Hz for 0.15s
 */
export function playBeep() {
  try {
    console.log('🔊 Playing beep sound...')
    playTone(600, 0.15, 0.3, 'sine', 0.0)
  } catch (err) {
    console.warn('Could not play beep sound:', err)
  }
}

/**
 * SUCCESS sound — rising two-tone
 * Used when an alert is resolved.
 */
export function playSuccess() {
  try {
    console.log('🔊 Playing success sound...')
    playTone(523, 0.12, 0.2, 'sine', 0.0)   // C5
    playTone(784, 0.18, 0.2, 'sine', 0.14)  // G5
  } catch (err) {
    console.warn('Could not play success sound:', err)
  }
}

/**
 * Test sound — plays both alarm and beep in sequence.
 * Used by the Settings page "Test Sound" button.
 */
export function playTestSequence() {
  try {
    console.log('🔊 Playing test sequence...')
    // Beep first
    playTone(600, 0.15, 0.3, 'sine', 0.0)
    // Short pause, then alarm
    playTone(880, 0.3, 0.5, 'square', 0.4)
    playTone(660, 0.3, 0.5, 'square', 0.8)
    playTone(440, 0.4, 0.5, 'square', 1.2)
  } catch (err) {
    console.warn('Could not play test sequence:', err)
  }
}

/**
 * Unlock the AudioContext.
 * Call this on the first user interaction (click anywhere).
 * Required by browser autoplay policy.
 */
export async function unlockAudio() {
  try {
    const ctx = getCtx()
    if (ctx.state === 'suspended') {
      await ctx.resume()
      console.log('✅ AudioContext unlocked successfully')
    }
    return ctx
  } catch (err) {
    console.warn('⚠️ Could not unlock AudioContext:', err)
  }
}
