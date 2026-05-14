import { createContext, useContext, useState, useCallback } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'

const UploadInsightContext = createContext(null)

export function UploadInsightProvider({ children }) {
  const [uploadInsights, setUploadInsights] = useState({})
  const [uploadInsightLoading, setUploadInsightLoading] = useState({})
  const [uploadInsightError, setUploadInsightError] = useState({})

  const generateInsight = useCallback(async (videoId) => {
    if (!videoId) return null
    if (uploadInsightLoading[videoId]) return null

    setUploadInsightLoading(prev => ({ ...prev, [videoId]: true }))
    setUploadInsightError(prev => ({ ...prev, [videoId]: null }))

    try {
      const res = await api.post(`/upload-insights/${videoId}`)
      const data = res.data
      setUploadInsights(prev => ({ ...prev, [videoId]: data }))
      if (!data.from_cache) {
        toast.success('AI audit report generated successfully!')
      }
      return data
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to generate AI report'
      setUploadInsightError(prev => ({ ...prev, [videoId]: msg }))
      console.error('Upload insight generation failed:', err)
      return null
    } finally {
      setUploadInsightLoading(prev => ({ ...prev, [videoId]: false }))
    }
  }, [uploadInsightLoading])

  const fetchSavedInsight = useCallback(async (videoId) => {
    if (!videoId) return null

    try {
      const res = await api.get(`/upload-insights/${videoId}`)
      const data = res.data
      setUploadInsights(prev => ({ ...prev, [videoId]: data }))
      return data
    } catch {
      return null
    }
  }, [])

  const deleteInsight = useCallback(async (videoId) => {
    if (!videoId) return

    try {
      await api.delete(`/upload-insights/${videoId}`)
      setUploadInsights(prev => {
        const next = { ...prev }
        delete next[videoId]
        return next
      })
      setUploadInsightLoading(prev => {
        const next = { ...prev }
        delete next[videoId]
        return next
      })
      setUploadInsightError(prev => {
        const next = { ...prev }
        delete next[videoId]
        return next
      })
    } catch (err) {
      console.error('Failed to delete insight:', err)
    }
  }, [])

  const clearInsight = useCallback((videoId) => {
    setUploadInsights(prev => {
      const next = { ...prev }
      delete next[videoId]
      return next
    })
    setUploadInsightLoading(prev => {
      const next = { ...prev }
      delete next[videoId]
      return next
    })
    setUploadInsightError(prev => {
      const next = { ...prev }
      delete next[videoId]
      return next
    })
  }, [])

  return (
    <UploadInsightContext.Provider value={{
      uploadInsights,
      uploadInsightLoading,
      uploadInsightError,
      generateInsight,
      fetchSavedInsight,
      deleteInsight,
      clearInsight,
      setUploadInsights,
    }}>
      {children}
    </UploadInsightContext.Provider>
  )
}

export function useUploadInsight() {
  const ctx = useContext(UploadInsightContext)
  if (!ctx) throw new Error('useUploadInsight must be used inside <UploadInsightProvider>')
  return ctx
}
