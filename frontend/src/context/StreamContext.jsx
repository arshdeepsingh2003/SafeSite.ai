import { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react'
import { useSocketEvent } from '../hooks/useSocket'
import api from '../services/api'

const StreamContext = createContext(null)

export function StreamProvider({ children }) {
  const [streamSessionId, setStreamSessionId] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState(null)
  const [liveSummary, setLiveSummary] = useState({
    totalWorkers: '--', compliant: '--', noHelmet: '--',
    noVest: '--', noHelmetVest: '--', complianceRate: '--',
  })
  const [currentDetections, setCurrentDetections] = useState([])
  const [detectionHistory, setDetectionHistory] = useState([])
  const [streamUrl, setStreamUrl] = useState('')
  const [originalUrl, setOriginalUrl] = useState('')
  const [aiInsight, setAiInsight] = useState(null)
  const [aiInsightLoading, setAiInsightLoading] = useState(false)

  const detectionsRef = useRef([])
  const streamSessionIdRef = useRef(null)

  useEffect(() => {
    streamSessionIdRef.current = streamSessionId
  }, [streamSessionId])

  const handleLiveDetection = useCallback((data) => {
    const dets = data.detections || []
    detectionsRef.current = dets
    setCurrentDetections(dets)
    setAnalysisError(null)

    const summary = data.summary || {}
    const total = summary.total_workers || 0
    const comp = summary.compliant || 0
    const rate = total > 0 ? Math.round((comp / total) * 100) : 100

    setLiveSummary({
      totalWorkers: total,
      compliant: comp,
      noHelmet: summary.no_helmet || 0,
      noVest: summary.no_vest || 0,
      noHelmetVest: summary.no_helmet_and_no_vest || 0,
      complianceRate: rate,
    })

    setDetectionHistory(prev => {
      const next = [...prev, {
        time: new Date().toLocaleTimeString(),
        helmet: summary.no_helmet || 0,
        vest: summary.no_vest || 0,
        both: summary.no_helmet_and_no_vest || 0,
      }]
      return next.length > 60 ? next.slice(-60) : next
    })
  }, [])

  useSocketEvent('live_detection', handleLiveDetection)

  const handleAiInsight = useCallback((data) => {
    setAiInsight(data)
    setAiInsightLoading(false)
  }, [])

  useSocketEvent('ai_insight', handleAiInsight)

  const startAnalysis = useCallback(async (url, zone = 'Zone A', camera = 'Camera 1') => {
    setIsAnalyzing(true)
    setAnalysisError(null)
    try {
      const res = await api.post('/ai/stream/start', {
        stream_url: url,
        zone,
        camera,
      })
      setStreamSessionId(res.data.session_id)
    } catch (err) {
      console.error('Start analysis failed:', err)
      setAnalysisError(err.response?.data?.detail || err.message || 'Failed to start analysis')
      setIsAnalyzing(false)
    }
  }, [])

  const stopAnalysis = useCallback(async () => {
    const sid = streamSessionIdRef.current
    if (!sid) return
    try {
      await api.post('/ai/stream/stop', { session_id: sid })
    } catch (err) {
      console.error('Failed to stop stream analysis:', err)
    }
    setStreamSessionId(null)
    setIsAnalyzing(false)
    setAnalysisError(null)
    setOriginalUrl('')
    setStreamUrl('')
    detectionsRef.current = []
    setCurrentDetections([])
    setLiveSummary({
      totalWorkers: '--', compliant: '--', noHelmet: '--',
      noVest: '--', noHelmetVest: '--', complianceRate: '--',
    })
    setDetectionHistory([])
  }, [])

  const resetDetections = useCallback(() => {
    detectionsRef.current = []
    setCurrentDetections([])
    setLiveSummary({
      totalWorkers: '--', compliant: '--', noHelmet: '--',
      noVest: '--', noHelmetVest: '--', complianceRate: '--',
    })
    setDetectionHistory([])
  }, [])

  return (
    <StreamContext.Provider value={{
      streamSessionId,
      isAnalyzing,
      analysisError,
      liveSummary,
      currentDetections,
      detectionHistory,
      detectionsRef,
      streamUrl, originalUrl,
      aiInsight,
      aiInsightLoading,
      setAiInsight,
      setAiInsightLoading,
      setStreamSessionId,
      setIsAnalyzing,
      setAnalysisError,
      setStreamUrl, setOriginalUrl,
      setCurrentDetections,
      setLiveSummary,
      setDetectionHistory,
      startAnalysis,
      stopAnalysis,
      resetDetections,
    }}>
      {children}
    </StreamContext.Provider>
  )
}

export function useStream() {
  const ctx = useContext(StreamContext)
  if (!ctx) throw new Error('useStream must be used inside <StreamProvider>')
  return ctx
}
