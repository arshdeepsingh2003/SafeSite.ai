// ============================================================
// SafeSite AI — useAlerts Hook
// File: frontend/src/hooks/useAlerts.js
//
// Encapsulates all alerts API calls.
// Usage:
//   const { alerts, summary, loading, total, ... } = useAlerts(filters)
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'

export function useAlerts({
  zone      = 'all',
  severity  = 'all',
  status    = 'all',
  violation = 'all',
  page      = 1,
  limit     = 20,
  autoRefreshMs = 15000,   // Re-fetch every 15 seconds (0 = disabled)
} = {}) {
  const [alerts,  setAlerts]  = useState([])
  const [summary, setSummary] = useState({ total: 0, no_helmet: 0, no_vest: 0, no_helmet_and_no_vest: 0 })
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        zone, severity, status, violation,
        limit,
        skip: (page - 1) * limit,
      })

      const [alertsRes, summaryRes] = await Promise.all([
        api.get(`/alerts?${params}`),
        api.get('/alerts/summary'),
      ])

      setAlerts(alertsRes.data.alerts  || [])
      setTotal(alertsRes.data.total    || 0)
      setSummary(summaryRes.data       || {})
    } catch (err) {
      console.error('Failed to load alerts:', err)
    } finally {
      setLoading(false)
    }
  }, [zone, severity, status, violation, page, limit])

  // Initial load + auto-refresh
  useEffect(() => {
    fetchAlerts()
    if (!autoRefreshMs) return
    const interval = setInterval(fetchAlerts, autoRefreshMs)
    return () => clearInterval(interval)
  }, [fetchAlerts, autoRefreshMs])

  // ── Actions ──

  const acknowledgeAlert = useCallback(async (alertId) => {
    try {
      await api.patch(`/alerts/${alertId}/status`, { status: 'acknowledged' })
      toast.success('Alert acknowledged')
      fetchAlerts()
    } catch {
      toast.error('Could not acknowledge alert')
    }
  }, [fetchAlerts])

  const resolveAlert = useCallback(async (alertId) => {
    try {
      await api.patch(`/alerts/${alertId}/status`, { status: 'resolved' })
      toast.success('Alert resolved ✓')
      fetchAlerts()
    } catch {
      toast.error('Could not resolve alert')
    }
  }, [fetchAlerts])

  const deleteAlert = useCallback(async (alertId) => {
    if (!window.confirm('Delete this alert permanently?')) return
    try {
      await api.delete(`/alerts/${alertId}`)
      toast.success('Alert deleted')
      fetchAlerts()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not delete alert')
    }
  }, [fetchAlerts])

  const resolveAll = useCallback(async () => {
    if (!window.confirm('Mark ALL alerts as resolved?')) return
    try {
      const res = await api.post('/alerts/resolve-all')
      toast.success(res.data.message)
      fetchAlerts()
    } catch {
      toast.error('Could not resolve all alerts')
    }
  }, [fetchAlerts])

  const createAlert = useCallback(async (alertData) => {
    try {
      const res = await api.post('/alerts', alertData)
      if (!res.data.cooldown) {
        toast.success('Alert created')
        fetchAlerts()
      }
      return res.data
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not create alert')
      return null
    }
  }, [fetchAlerts])

  return {
    alerts,
    summary,
    total,
    loading,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    refresh:    fetchAlerts,
    acknowledgeAlert,
    resolveAlert,
    deleteAlert,
    resolveAll,
    createAlert,
  }
}