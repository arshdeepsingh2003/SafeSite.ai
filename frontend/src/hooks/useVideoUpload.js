// ============================================================
// SafeSite AI — useVideoUpload Hook
// File: frontend/src/hooks/useVideoUpload.js
//
// Encapsulates all the upload logic so VideoUploadPage stays clean.
// Usage:
//   const { uploadFile, registerStream, videos, loading } = useVideoUpload()
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'

export function useVideoUpload() {
  const [videos,         setVideos]         = useState([])
  const [loadingList,    setLoadingList]    = useState(false)
  const [uploading,      setUploading]      = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  // ── Fetch the list of uploaded videos from the backend ──
  const fetchVideos = useCallback(async () => {
    setLoadingList(true)
    try {
      const res = await api.get('/video/list')
      setVideos(res.data.videos || [])
    } catch (err) {
      console.error('Could not load video list:', err)
    } finally {
      setLoadingList(false)
    }
  }, [])

  // Auto-load on mount
  useEffect(() => { fetchVideos() }, [fetchVideos])

  // ── Upload a video file ──
  const uploadFile = useCallback(async (file, zone = 'Zone A') => {
    if (!file) {
      toast.error('Please select a video file first')
      return null
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('zone', zone)

    setUploading(true)
    setUploadProgress(0)

    try {
      const res = await api.post('/video/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (evt) => {
          const pct = Math.round((evt.loaded * 100) / evt.total)
          setUploadProgress(pct)
        },
      })
      toast.success(`✅ "${file.name}" uploaded successfully!`)
      await fetchVideos()  // Refresh the list
      return res.data
    } catch (err) {
      const msg = err.response?.data?.detail || 'Upload failed. Please try again.'
      toast.error(msg)
      return null
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }, [fetchVideos])

  // ── Register a live stream URL ──
  const registerStream = useCallback(async (url, zone = 'Zone A', cameraName = 'Camera 1') => {
    if (!url.trim()) {
      toast.error('Please enter a stream URL')
      return null
    }

    try {
      const params = new URLSearchParams({ url, zone, camera_name: cameraName })
      const res = await api.post('/video/stream-url', params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      toast.success(`✅ Stream "${cameraName}" registered!`)
      await fetchVideos()
      return res.data
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to register stream'
      toast.error(msg)
      return null
    }
  }, [fetchVideos])

  // ── Delete a video ──
  const deleteVideo = useCallback(async (videoId, name) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return
    try {
      await api.delete(`/video/${videoId}`)
      toast.success('Video deleted')
      await fetchVideos()
    } catch (err) {
      toast.error('Could not delete video')
    }
  }, [fetchVideos])

  return {
    videos,
    loadingList,
    uploading,
    uploadProgress,
    uploadFile,
    registerStream,
    deleteVideo,
    refreshVideos: fetchVideos,
  }
}