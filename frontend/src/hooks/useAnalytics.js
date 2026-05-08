import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'

export function useAnalytics({ range = 'week', granularity = 'daily' } = {}) {
  const [trend,   setTrend]   = useState([])
  const [loading, setLoading] = useState(true)

  const fetchTrend = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ range, granularity })
      const res = await api.get(`/analytics/trend?${params}`)
      setTrend(res.data || [])
    } catch (err) {
      console.error('Failed to load analytics trend:', err)
      setTrend([])
    } finally {
      setLoading(false)
    }
  }, [range, granularity])

  useEffect(() => {
    fetchTrend()
  }, [fetchTrend])

  return { trend, loading, refresh: fetchTrend }
}