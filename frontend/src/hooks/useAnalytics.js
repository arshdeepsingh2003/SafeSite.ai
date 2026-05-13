// ============================================================
// SafeSite AI — useAnalytics Hook  (Phase 11)
// File: frontend/src/hooks/useAnalytics.js
//
// Fetches all analytics data in parallel.
// Used by AnalyticsPage and any future components that
// need aggregated violation statistics.
//
// Usage:
//   const { summary, trend, zoneData, heatmap, loading, refresh } = useAnalytics({ range, zone })
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'

export function useAnalytics({
  range       = 'week',
  zone        = 'all',
  granularity = 'daily',
  autoRefreshMs = 0,
} = {}) {
  const [summary,         setSummary]         = useState(null)
  const [trend,           setTrend]           = useState([])
  const [zoneData,        setZoneData]        = useState([])
  const [heatmap,         setHeatmap]         = useState({ heatmap: [], days: [], buckets: [], max_count: 1 })
  const [complianceTrend, setComplianceTrend] = useState([])
  const [zoneSummary,     setZoneSummary]     = useState([])
  const [detectionStats,  setDetectionStats]  = useState(null)
  const [loading,         setLoading]         = useState(true)
  const [error,           setError]           = useState(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)

    const results = await Promise.allSettled([
      api.get(`/analytics/summary?range=${range}&zone=${zone}`),
      api.get(`/analytics/trend?range=${range}&granularity=${granularity}&zone=${zone}`),
      api.get(`/analytics/by-zone?range=${range}&zone=${zone}`),
      api.get(`/analytics/by-time-of-day?range=${range}&zone=${zone}`),
      api.get(`/analytics/compliance-trend?range=${range}&zone=${zone}`),
      api.get(`/analytics/zone-summary?range=${range}&zone=${zone}`),
      api.get(`/analytics/detection-summary?range=${range}&zone=${zone}`),
    ])

    const [sumRes, trendRes, zoneRes, heatRes, compRes, zsRes, detRes] = results

    const errors = results.filter(r => r.status === 'rejected')
    if (errors.length > 0) {
      console.error('Analytics fetch errors:', errors.map(e => e.reason))
      if (errors.length === results.length) {
        setError('Could not load analytics data. Make sure the backend is running.')
      }
    }

    if (sumRes.status === 'fulfilled')  setSummary(sumRes.value.data)
    if (trendRes.status === 'fulfilled') setTrend(trendRes.value.data.data || [])
    if (zoneRes.status === 'fulfilled')  setZoneData(zoneRes.value.data.zones || [])
    if (heatRes.status === 'fulfilled')  setHeatmap(heatRes.value.data)
    if (compRes.status === 'fulfilled')  setComplianceTrend(compRes.value.data.weeks || [])
    if (zsRes.status === 'fulfilled')    setZoneSummary(zsRes.value.data.rows || [])
    if (detRes.status === 'fulfilled')   setDetectionStats(detRes.value.data)

    setLoading(false)
  }, [range, zone, granularity])

  // Load on mount and whenever filters change
  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // Optional auto-refresh
  useEffect(() => {
    if (!autoRefreshMs) return
    const id = setInterval(fetchAll, autoRefreshMs)
    return () => clearInterval(id)
  }, [fetchAll, autoRefreshMs])

  // ── Export helper ──────────────────────────────────────────
  function exportCSV() {
    if (!zoneSummary.length) return

    const headers = ['Zone', 'Total Workers', 'Compliant', 'No Helmet', 'No Vest', 'No Helmet & No Vest', 'Compliance Rate']
    const rows = zoneSummary.map(z => [
      z.zone,
      z.total_workers,
      z.compliant,
      z.no_helmet,
      z.no_vest,
      z.no_helmet_and_no_vest,
      `${z.compliance_rate?.toFixed(1)}%`,
    ])

    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `safesite-analytics-${range}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return {
    // Data
    summary,
    trend,
    zoneData,
    heatmap,
    complianceTrend,
    zoneSummary,
    detectionStats,
    // State
    loading,
    error,
    // Actions
    refresh:   fetchAll,
    exportCSV,
  }
}