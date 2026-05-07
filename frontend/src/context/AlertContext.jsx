// ============================================================
// SafeSite AI — Alert Context
// File: frontend/src/context/AlertContext.jsx
//
// This file creates a global React context for alerts so the unread alert count can be accessed anywhere in your frontend app without repeatedly fetching data on every page.
//
// Usage anywhere in the app:
//   const { unreadCount, refreshCount } = useAlertContext()
// ============================================================

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../services/api'

const AlertContext = createContext(null)

export function AlertProvider({ children }) {
  const [unreadCount, setUnreadCount] = useState(0)

  // Fetch the number of "new" (unread) alerts
  const refreshCount = useCallback(async () => {
    const token = localStorage.getItem('safesite_token')
    if (!token) return // Don't fetch if not logged in

    try {
      // GET /alerts?status=new&limit=1 — we only need the total count
      const res = await api.get('/alerts?status=new&limit=1')
      setUnreadCount(res.data.total || 0)
    } catch {
      // Silently ignore — user might not be logged in yet
    }
  }, [])

  // Poll every 30 seconds to keep the badge live
  useEffect(() => {
    refreshCount()
    const interval = setInterval(refreshCount, 30000)
    return () => clearInterval(interval)
  }, [refreshCount])

  return (
    <AlertContext.Provider value={{ unreadCount, refreshCount }}>
      {children}
    </AlertContext.Provider>
  )
}

export function useAlertContext() {
  const ctx = useContext(AlertContext)
  if (!ctx) throw new Error('useAlertContext must be used inside <AlertProvider>')
  return ctx
}