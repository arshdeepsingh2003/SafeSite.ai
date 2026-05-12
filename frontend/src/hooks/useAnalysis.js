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
  const [analysisResults, setAnalysisResults] = useState({}) // { [videoId]: summary }
  const [fullAnalysisData, setFullAnalysisData] = useState({}) // { [videoId]: fullData including frame_detections }
  const pollingRefs = useRef({})  // Track polling intervals per video

  // ── Fetch full analysis data (including frame_detections) ──
  const fetchFullResults = useCallback(async (videoId) => {
    try {
      const res = await api.get(`/ai/results/${videoId}`)
      setFullAnalysisData(prev => ({ ...prev, [videoId]: res.data }))
      return res.data
    } catch (err) {
      console.error('Failed to fetch full analysis results:', err)
      return null
    }
  }, [])

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

          // Fetch full analysis data including frame_detections
          await fetchFullResults(videoId)

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
  }, [fetchFullResults])

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
    fetchFullResults,
    analysisStatus,     // { videoId: status }
    analysisResults,    // { videoId: summary }
    fullAnalysisData,   // { videoId: { frame_detections, workers, annotated_video_url, ... } }
  }
}