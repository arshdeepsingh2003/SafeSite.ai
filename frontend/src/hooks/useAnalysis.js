// ============================================================
// SafeSite AI — useAnalysis Hook
// File: frontend/src/hooks/useAnalysis.js
//
// Manages triggering AI analysis and polling for results.
// Usage:
//   const { startAnalysis, status, result, polling } = useAnalysis()
// ============================================================

import { useState, useCallback, useRef } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'

export function useAnalysis() {
  const [analysisStatus, setAnalysisStatus] = useState({})  // { [videoId]: "processing"|"completed"|"error" }
  const [analysisResults, setAnalysisResults] = useState({}) // { [videoId]: resultObject }
  const pollingRefs = useRef({})  // Track polling intervals per video

  // ── Trigger analysis on a video ──
  const startAnalysis = useCallback(async (videoId) => {
    if (!videoId) return

    try {
      setAnalysisStatus(prev => ({ ...prev, [videoId]: 'processing' }))
      await api.post(`/ai/analyze/${videoId}`)
      toast.success('🤖 AI analysis started! We\'ll notify you when done.')

      // Start polling every 3 seconds to check progress
      _startPolling(videoId)
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to start analysis'
      toast.error(msg)
      setAnalysisStatus(prev => ({ ...prev, [videoId]: 'error' }))
    }
  }, [])

  // ── Poll backend for status ──
  const _startPolling = useCallback((videoId) => {
    // Clear any existing polling for this video
    if (pollingRefs.current[videoId]) {
      clearInterval(pollingRefs.current[videoId])
    }

    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/ai/status/${videoId}`)
        const { status, summary } = res.data

        setAnalysisStatus(prev => ({ ...prev, [videoId]: status }))

        if (status === 'completed') {
          // Stop polling
          clearInterval(pollingRefs.current[videoId])
          delete pollingRefs.current[videoId]

          // Store the summary
          if (summary) {
            setAnalysisResults(prev => ({ ...prev, [videoId]: summary }))
          }

          toast.success(`✅ Analysis complete! Compliance rate: ${summary?.compliance_rate ?? '?'}%`)
        }

        if (status === 'error') {
          clearInterval(pollingRefs.current[videoId])
          delete pollingRefs.current[videoId]
          toast.error('❌ Analysis failed. Check the AI service logs.')
        }
      } catch (err) {
        // Ignore polling errors silently
      }
    }, 3000) // Poll every 3 seconds

    pollingRefs.current[videoId] = interval
  }, [])

  // ── Manually check status once ──
  const checkStatus = useCallback(async (videoId) => {
    try {
      const res = await api.get(`/ai/status/${videoId}`)
      setAnalysisStatus(prev => ({ ...prev, [videoId]: res.data.status }))
      if (res.data.summary) {
        setAnalysisResults(prev => ({ ...prev, [videoId]: res.data.summary }))
      }
      return res.data
    } catch (err) {
      return null
    }
  }, [])

  return {
    startAnalysis,
    checkStatus,
    analysisStatus,   // { videoId: status }
    analysisResults,  // { videoId: summary }
  }
}