import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'

export function useLLM() {
  const [groqStatus,  setGroqStatus]  = useState(null)
  const [loadingStatus, setLoadingStatus] = useState(true)

  // Check on mount if Groq is configured
  useEffect(() => {
    api.get('/llm/status')
      .then(r => setGroqStatus(r.data))
      .catch(() => setGroqStatus({ configured: false }))
      .finally(() => setLoadingStatus(false))
  }, [])

  // ── Analyze detections (after video analysis) ──────────────
  const analyzeDetections = useCallback(async (summary) => {
    try {
      const res = await api.post('/llm/analyze', summary)
      return res.data
    } catch (err) {
      console.error('LLM analyze failed:', err)
      return null
    }
  }, [])

  // ── Get daily report ───────────────────────────────────────
  const getDailyReport = useCallback(async (date = null) => {
    try {
      const url = date ? `/llm/report/daily?date=${date}` : '/llm/report/daily'
      const res = await api.get(url)
      return res.data
    } catch (err) {
      toast.error('Could not generate daily report')
      return null
    }
  }, [])

  // ── Get weekly report ──────────────────────────────────────
  const getWeeklyReport = useCallback(async () => {
    try {
      const res = await api.get('/llm/report/weekly')
      return res.data
    } catch (err) {
      toast.error('Could not generate weekly report')
      return null
    }
  }, [])

  // ── Get single-alert insight ───────────────────────────────
  const getAlertInsight = useCallback(async (alert) => {
    try {
      const res = await api.post('/llm/alert-insight', {
        violation_type: alert.violation_type,
        severity:       alert.severity,
        zone:           alert.zone,
        worker_id:      alert.worker_id || 0,
        has_helmet:     alert.has_helmet ?? true,
        has_vest:       alert.has_vest ?? true,
      })
      return res.data.insight
    } catch {
      return null
    }
  }, [])

  return {
    groqStatus,
    loadingStatus,
    isConfigured:       groqStatus?.configured ?? false,
    analyzeDetections,
    getDailyReport,
    getWeeklyReport,
    getAlertInsight,
  }
}