import { useState, useCallback, useRef } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'

export function useAnalysis() {
  const [analysisStatus, setAnalysisStatus] = useState({})
  const [analysisResults, setAnalysisResults] = useState({})
  const [fullAnalysisData, setFullAnalysisData] = useState({})
  const [analysisProgress, setAnalysisProgress] = useState({})
  const [aiInsights, setAiInsights] = useState({})
  const [aiInsightsLoading, setAiInsightsLoading] = useState({})
  const pollingRefs = useRef({})

  const fetchAIInsight = useCallback(async (videoId) => {
    try {
      setAiInsightsLoading(prev => ({ ...prev, [videoId]: true }))
      const res = await api.post(`/llm/analyze-video/${videoId}`)
      setAiInsights(prev => ({ ...prev, [videoId]: res.data }))
      return res.data
    } catch {
      console.error('Failed to fetch AI insight')
      return null
    } finally {
      setAiInsightsLoading(prev => ({ ...prev, [videoId]: false }))
    }
  }, [])

  const fetchFullResults = useCallback(async (videoId) => {
    try {
      const res = await api.get(`/ai/results/${videoId}`)
      setFullAnalysisData(prev => ({ ...prev, [videoId]: res.data }))
      return res.data
    } catch {
      console.error('Failed to fetch full analysis results')
      return null
    }
  }, [])

  const _startPolling = useCallback((videoId) => {
    if (pollingRefs.current[videoId]) {
      clearInterval(pollingRefs.current[videoId])
    }

    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/ai/status/${videoId}`)
        const { status, summary, analysis_progress: progress } = res.data

        setAnalysisStatus(prev => ({ ...prev, [videoId]: status }))

        if (progress) {
          setAnalysisProgress(prev => ({ ...prev, [videoId]: progress }))
        }

        if (status === 'completed') {
          clearInterval(pollingRefs.current[videoId])
          delete pollingRefs.current[videoId]
          setAnalysisProgress(prev => ({ ...prev, [videoId]: { progress: 100 } }))

          if (summary) {
            setAnalysisResults(prev => ({ ...prev, [videoId]: summary }))
          }

          await fetchFullResults(videoId)

          fetchAIInsight(videoId)

          toast.success(`Analysis complete! Compliance rate: ${summary?.compliance_rate ?? '?'}%`)
        }

        if (status === 'error') {
          clearInterval(pollingRefs.current[videoId])
          delete pollingRefs.current[videoId]
          toast.error('Analysis failed. Check the AI service logs.')
        }
      } catch {
        // Ignore polling errors silently
      }
    }, 2000)

    pollingRefs.current[videoId] = interval
  }, [fetchFullResults, fetchAIInsight])

  const startAnalysis = useCallback(async (videoId) => {
    if (!videoId) return

    try {
      setAnalysisStatus(prev => ({ ...prev, [videoId]: 'processing' }))
      await api.post(`/ai/analyze/${videoId}`)
      toast.success('AI analysis started!')
      _startPolling(videoId)
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to start analysis'
      toast.error(msg)
      setAnalysisStatus(prev => ({ ...prev, [videoId]: 'error' }))
    }
  }, [_startPolling])

  const checkStatus = useCallback(async (videoId) => {
    try {
      const res = await api.get(`/ai/status/${videoId}`)
      setAnalysisStatus(prev => ({ ...prev, [videoId]: res.data.status }))
      if (res.data.analysis_progress) {
        setAnalysisProgress(prev => ({ ...prev, [videoId]: res.data.analysis_progress }))
      }
      if (res.data.summary) {
        setAnalysisResults(prev => ({ ...prev, [videoId]: res.data.summary }))
      }
      return res.data
    } catch {
      return null
    }
  }, [])

  return {
    startAnalysis,
    checkStatus,
    fetchFullResults,
    fetchAIInsight,
    analysisStatus,
    analysisResults,
    fullAnalysisData,
    analysisProgress,
    aiInsights,
    aiInsightsLoading,
  }
}
