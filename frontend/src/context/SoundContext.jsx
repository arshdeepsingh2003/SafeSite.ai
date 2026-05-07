// ============================================================
// SafeSite AI — Sound Settings Context
// File: frontend/src/context/SoundContext.jsx
//
// Manages the global "sound enabled" toggle.
// Settings are saved to localStorage so they persist
// after page refresh.
//
// Usage anywhere in the app:
//   const { soundEnabled, setSoundEnabled, volume, setVolume } = useSoundSettings()
// ============================================================

import { createContext, useContext, useState, useEffect } from 'react'
import { unlockAudio } from '../services/soundService'

const SoundContext = createContext(null)

// Keys used in localStorage
const STORAGE_KEY_ENABLED = 'safesite_sound_enabled'
const STORAGE_KEY_VOLUME  = 'safesite_sound_volume'
const STORAGE_KEY_HIGH    = 'safesite_sound_high_only'

export function SoundProvider({ children }) {
  // Read saved settings from localStorage (default: enabled, volume 70%, all severities)
  const [soundEnabled, setSoundEnabledState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_ENABLED)
    return saved !== null ? saved === 'true' : true   // default ON
  })

  const [volume, setVolumeState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_VOLUME)
    return saved !== null ? parseFloat(saved) : 0.7   // default 70%
  })

  // "High severity only" — if true, only HIGH alerts play sound
  const [highOnly, setHighOnlyState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_HIGH)
    return saved !== null ? saved === 'true' : false  // default: all severities
  })

  // Persist to localStorage whenever settings change
  const setSoundEnabled = (val) => {
    setSoundEnabledState(val)
    localStorage.setItem(STORAGE_KEY_ENABLED, String(val))
  }

  const setVolume = (val) => {
    setVolumeState(val)
    localStorage.setItem(STORAGE_KEY_VOLUME, String(val))
  }

  const setHighOnly = (val) => {
    setHighOnlyState(val)
    localStorage.setItem(STORAGE_KEY_HIGH, String(val))
  }

  // Unlock AudioContext on first user interaction
  // (required by browser autoplay policy)
  useEffect(() => {
    const unlock = () => {
      unlockAudio()
      window.removeEventListener('click', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('click', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('click', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  return (
    <SoundContext.Provider value={{
      soundEnabled,
      setSoundEnabled,
      volume,
      setVolume,
      highOnly,
      setHighOnly,
    }}>
      {children}
    </SoundContext.Provider>
  )
}

export function useSoundSettings() {
  const ctx = useContext(SoundContext)
  if (!ctx) throw new Error('useSoundSettings must be used inside <SoundProvider>')
  return ctx
}