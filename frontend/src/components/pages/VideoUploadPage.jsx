// ============================================================
// SafeSite AI — Video Upload & Analysis Page  (Phase 3 + 4 + Detection Output)
// File: frontend/src/components/pages/VideoUploadPage.jsx
// ============================================================

import { useState, useRef, useCallback, useEffect } from 'react'
import { useVideoUpload }   from '../../hooks/useVideoUpload'
import { useAnalysis }      from '../../hooks/useAnalysis'
import { useUploadInsight } from '../../context/UploadInsightContext'
import AnalysisResultCard   from '../ui/AnalysisResultCard'
import UploadAIReport       from '../ui/UploadAIReport'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function makeFullUrl(relativeUrl) {
  if (!relativeUrl) return null
  if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
    return relativeUrl
  }
  return `${API_URL}${relativeUrl}`
}

function findDetectionsForTime(frameDetections, currentTimeSec) {
  if (!frameDetections || frameDetections.length === 0) {
    return { detections: [], total_workers: 0, violations: 0 }
  }

  let bestMatch = frameDetections[0]
  let smallestDiff = Math.abs(bestMatch.timestamp_sec - currentTimeSec)

  for (let i = 1; i < frameDetections.length; i++) {
    const diff = Math.abs(frameDetections[i].timestamp_sec - currentTimeSec)
    if (diff < smallestDiff) {
      smallestDiff = diff
      bestMatch = frameDetections[i]
    }
  }

  return {
    detections: bestMatch.detections || [],
    total_workers: bestMatch.total_workers || 0,
    violations: bestMatch.violations || 0,
  }
}

// ── Helpers ──────────────────────────────────────────────────

const STATUS_STYLE = {
  completed:  { bg: 'rgba(34,197,94,0.15)',  color: '#22c55e', border: 'rgba(34,197,94,0.3)'  },
  processing: { bg: 'rgba(234,179,8,0.15)',  color: '#eab308', border: 'rgba(234,179,8,0.3)'  },
  uploaded:   { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: 'rgba(59,130,246,0.3)' },
  error:      { bg: 'rgba(239,68,68,0.15)',  color: '#ef4444', border: 'rgba(239,68,68,0.3)'  },
}

function StatusBadge({ status = 'uploaded' }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.uploaded
  return (
    <span style={{
      fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '12px',
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      textTransform: 'capitalize',
    }}>{status}</span>
  )
}

const VIOLATION_COLORS = {
  no_helmet: '#f97316',
  no_vest: '#eab308',
  no_helmet_and_no_vest: '#ef4444',
  compliant: '#22c55e',
  none: '#22c55e',
}

function DetectionItem({ det }) {
  const vtype = det.violation || 'compliant'
  const isCompliant = vtype === 'none' || det.severity === 'safe'
  const color = isCompliant ? '#22c55e' : (VIOLATION_COLORS[vtype] || '#8b949e')
  const label = det.label || vtype.replace(/_/g, ' ')

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '8px 10px',
      background: `${color}10`,
      border: `1px solid ${color}30`,
      borderRadius: '8px', marginBottom: '6px',
    }}>
      <div style={{
        width: '8px', height: '8px', borderRadius: '50%',
        background: color, flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12px', fontWeight: '600', color: '#e6edf3' }}>
          Worker #{det.worker_id || '?'}
        </div>
        <div style={{ fontSize: '11px', color }}>
          {label}
        </div>
      </div>
      {det.has_helmet !== undefined && (
        <span style={{ fontSize: '14px' }}>
          {det.has_helmet ? '⛑️' : '❌'}
          {det.has_vest ? '🦺' : '❌'}
        </span>
      )}
    </div>
  )
}

function PreviousItem({ video, onDelete, onAnalyze, onView, analyzing }) {
  const isProcessing = analyzing || video.status === 'processing'
  return (
    <div style={{
      display: 'flex', gap: '10px', padding: '12px 0',
      borderBottom: '1px solid var(--border)', alignItems: 'flex-start',
    }}>
      <div style={{
        width: '64px', height: '44px', flexShrink: 0,
        background: 'var(--bg-primary)', borderRadius: '6px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '18px', border: '1px solid var(--border)',
      }}>
        {video.type === 'stream' ? '📡' : '🎬'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '12px', fontWeight: '600', color: '#e6edf3',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          marginBottom: '3px',
        }}>
          {video.original_name || video.camera_name || 'Untitled'}
        </div>
        <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '6px' }}>
          {video.file_size_mb ? `${video.file_size_mb} MB` : 'Live Stream'} • {video.zone}
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <StatusBadge status={video.status} />

          {/* Show Analyze button only for uploaded (not stream, not yet analyzed) */}
           {video.type !== 'stream' && video.status === 'uploaded' && (
              <button
                onClick={() => onAnalyze(video.id)}
                disabled={isProcessing}
                style={{
                  padding: '2px 8px',
                  background: 'rgba(99,102,241,0.15)',
                  border: '1px solid rgba(99,102,241,0.4)',
                  borderRadius: '6px', color: '#818cf8',
                  fontSize: '11px', cursor: 'pointer', fontWeight: '600',
                }}
              >
                {isProcessing ? '⏳ Analyzing…' : '🤖 Analyze'}
              </button>
           )}

           {video.status === 'completed' && (
             <button
               onClick={() => onView(video.id)}
               style={{
                 padding: '2px 8px',
                 background: 'rgba(34,197,94,0.15)',
                 border: '1px solid rgba(34,197,94,0.4)',
                 borderRadius: '6px', color: '#22c55e',
                 fontSize: '11px', cursor: 'pointer', fontWeight: '600',
               }}
             >
               📋 View Report
             </button>
           )}

           <button
              onClick={() => onDelete(video.id, video.original_name || 'this video')}
             style={{
               background: 'none', border: 'none', cursor: 'pointer',
               color: '#8b949e', fontSize: '12px', padding: '0 2px',
             }}
             title="Delete"
           >🗑</button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────
export default function VideoUploadPage() {
  const {
    videos, loadingList, uploading, uploadProgress,
    uploadFile, deleteVideo, deleteAllVideos,
  } = useVideoUpload()

  const {
    startAnalysis, checkStatus, analysisStatus, analysisResults, fullAnalysisData,
    analysisProgress, fetchFullResults,
  } = useAnalysis()

  const {
    uploadInsights, uploadInsightLoading, uploadInsightError,
    generateInsight, fetchSavedInsight,
  } = useUploadInsight()

  const [dragOver,     setDragOver]     = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl,   setPreviewUrl]   = useState(null)
  const [zone,         setZone]         = useState('Zone A')
  const [lastUploadId, setLastUploadId] = useState(null)
  const fileInputRef = useRef(null)
  const changeFileInputRef = useRef(null)

  const ZONE_OPTIONS = ['Zone A', 'Zone B', 'Zone C', 'Zone D']

  // ── Derived state (defined before effects that use them) ──
  const fileSizeMB = selectedFile ? (selectedFile.size / 1024 / 1024).toFixed(1) : null
  const lastResult = lastUploadId ? analysisResults[lastUploadId] : null
  const lastStatus = lastUploadId ? analysisStatus[lastUploadId] : null
  const lastFullData = lastUploadId ? fullAnalysisData[lastUploadId] : null
  const lastVideo = lastUploadId ? videos.find(v => v.id === lastUploadId) : null
  const originalVideoUrl = lastVideo?.stored_name
    ? makeFullUrl(`/uploads/videos/${lastVideo.stored_name}`)
    : null
  const frameDetections = lastFullData?.frame_detections || []
  const hasFrameDetections = frameDetections.length > 0

  // When analysis completes, generate the upload insight report
  useEffect(() => {
    if (lastStatus === 'completed' && lastUploadId && !uploadInsights[lastUploadId] && !uploadInsightLoading[lastUploadId]) {
      generateInsight(lastUploadId)
    }
  }, [lastStatus, lastUploadId, uploadInsights, uploadInsightLoading, generateInsight])

  // Load saved insights when viewing previously analyzed videos
  useEffect(() => {
    if (!lastUploadId || lastStatus !== 'completed') return
    if (uploadInsights[lastUploadId]) return
    fetchSavedInsight(lastUploadId)
  }, [lastUploadId, lastStatus, uploadInsights, fetchSavedInsight])

  // ── Detection Output refs and state ──
  const outputVideoRef = useRef(null)
  const outputCanvasRef = useRef(null)
  const outputAnimRef = useRef(null)
  const outputDetectionsRef = useRef([])
  const [outputPlaying, setOutputPlaying] = useState(false)
  const [currentOutputDetections, setCurrentOutputDetections] = useState([])
  const [currentOutputStats, setCurrentOutputStats] = useState({ total: 0, violations: 0 })

  const ALLOWED_EXTS = ['mp4', 'mov', 'avi', 'mkv']

  function validateAndSetFile(file) {
    const ext = file.name.split('.').pop().toLowerCase()
    if (!ALLOWED_EXTS.includes(ext)) {
      alert('Only MP4, MOV, AVI, MKV files are allowed.')
      return
    }
    if (file.size > 2 * 1024 * 1024 * 1024) {
      alert('File too large. Max 2 GB.')
      return
    }
    setSelectedFile(file)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(URL.createObjectURL(file))
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) validateAndSetFile(file)
  }, [])

  // Upload then immediately trigger AI analysis
  async function handleStartAnalysis() {
    const result = await uploadFile(selectedFile, zone)
    if (result?.video_id) {
      setLastUploadId(result.video_id)
      setSelectedFile(null)
      if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null) }
      // Automatically kick off AI analysis
      await startAnalysis(result.video_id)
    }
  }

  const loadPreviousAnalysis = useCallback(async (videoId) => {
    setLastUploadId(videoId)
    setSelectedFile(null)
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null) }

    const data = await checkStatus(videoId)
    if (data?.status === 'completed') {
      if (!fullAnalysisData[videoId]) {
        await fetchFullResults(videoId)
      }
      if (!uploadInsights[videoId]) {
        fetchSavedInsight(videoId)
      }
    }
  }, [fullAnalysisData, uploadInsights, fetchSavedInsight, fetchFullResults, checkStatus])

  // ── Canvas sync and draw functions ──
  function syncOutputCanvasSize() {
    const canvas = outputCanvasRef.current
    const video = outputVideoRef.current
    if (!canvas || !video) return
    const rect = video.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      canvas.width = rect.width
      canvas.height = rect.height
    }
  }

  // ── Canvas drawing effect ──
  useEffect(() => {
    const canvas = outputCanvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const w = canvas.width
      const h = canvas.height

      if (w === 0 || h === 0) {
        outputAnimRef.current = requestAnimationFrame(draw)
        return
      }

      const dets = outputDetectionsRef.current || []

      for (const det of dets) {
        const bbox = det.bbox
        if (!bbox || bbox.length < 4) continue

        const x1 = bbox[0] * w
        const y1 = bbox[1] * h
        const bw = (bbox[2] - bbox[0]) * w
        const bh = (bbox[3] - bbox[1]) * h
        const color = det.color_hex || (det.severity === 'safe' ? '#22c55e' : '#ef4444')
        const label = det.label || det.violation || 'unknown'

        ctx.strokeStyle = color
        ctx.lineWidth = 2.5
        ctx.strokeRect(x1, y1, bw, bh)

        ctx.fillStyle = `${color}20`
        ctx.fillRect(x1, y1, bw, bh)

        const text = label
        ctx.font = 'bold 12px monospace'
        const tw = ctx.measureText(text).width
        const lh = 20

        ctx.fillStyle = color
        ctx.fillRect(x1, y1 - lh, tw + 8, lh)

        ctx.fillStyle = '#ffffff'
        ctx.fillText(text, x1 + 4, y1 - 5)

        if (det.worker_id) {
          const idText = `#${det.worker_id}`
          ctx.font = 'bold 10px monospace'
          ctx.fillStyle = color
          ctx.fillText(idText, x1 + 4, y1 + bh - 4)
        }
      }

      outputAnimRef.current = requestAnimationFrame(draw)
    }

    outputAnimRef.current = requestAnimationFrame(draw)
    return () => {
      if (outputAnimRef.current) cancelAnimationFrame(outputAnimRef.current)
    }
  }, [hasFrameDetections])

  // ── Video time update handler ──
  function handleOutputTimeUpdate() {
    const video = outputVideoRef.current
    if (!video || !hasFrameDetections) return

    const currentTime = video.currentTime
    const result = findDetectionsForTime(frameDetections, currentTime)

    outputDetectionsRef.current = result.detections
    setCurrentOutputDetections(result.detections)
    setCurrentOutputStats({
      total: result.total_workers,
      violations: result.violations,
    })
  }

  // ── Setup event listeners when video is available ──
  useEffect(() => {
    if (!lastFullData || !hasFrameDetections) return

    const video = outputVideoRef.current
    if (!video) return

    const handleLoadedMetadata = syncOutputCanvasSize
    const handlePlay = () => { setOutputPlaying(true); syncOutputCanvasSize() }
    const handlePause = () => setOutputPlaying(false)
    const handleResize = syncOutputCanvasSize

    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('timeupdate', handleOutputTimeUpdate)
    window.addEventListener('resize', handleResize)

    // Reset detections ref
    outputDetectionsRef.current = []

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('timeupdate', handleOutputTimeUpdate)
      window.removeEventListener('resize', handleResize)
    }
  }, [lastFullData, hasFrameDetections])

  // ── Helper to get display video URL ──
  // Use annotated video if available (though mp4v may not play in browsers)
  // Fallback to original video + canvas overlay
  const displayVideoUrl = originalVideoUrl

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '12px', color: '#8b949e', marginBottom: '4px' }}>
          Dashboard › Video Upload
        </div>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#e6edf3' }}>
          Video Upload &amp; Analysis
        </h1>
      </div>

        {/* 3-column grid */}
       <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', alignItems: 'start' }}>

        {/* ── LEFT: Upload controls ── */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#e6edf3', marginBottom: '6px' }}>
            Upload Video
          </h2>
          <p style={{ fontSize: '13px', color: '#8b949e', marginBottom: '20px' }}>
            Upload a video file to analyze safety compliance on your construction site.
          </p>

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? '#6366f1' : selectedFile ? '#22c55e' : '#30363d'}`,
              borderRadius: '10px', padding: '36px 20px',
              textAlign: 'center', cursor: 'pointer',
              background: dragOver ? 'rgba(99,102,241,0.05)' : selectedFile ? 'rgba(34,197,94,0.04)' : 'transparent',
              transition: 'all 0.2s', marginBottom: '16px',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp4,.mov,.avi,.mkv"
              style={{ display: 'none' }}
              onChange={(e) => e.target.files[0] && validateAndSetFile(e.target.files[0])}
            />
            {selectedFile ? (
              <>
                <div style={{ fontSize: '36px', marginBottom: '10px' }}>✅</div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#22c55e', marginBottom: '4px' }}>
                  {selectedFile.name}
                </div>
                <div style={{ fontSize: '12px', color: '#8b949e' }}>{fileSizeMB} MB • Ready to upload</div>
              </>
            ) : (
              <>
                <div style={{
                  width: '52px', height: '52px', margin: '0 auto 14px',
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  borderRadius: '12px', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '22px',
                }}>⬆️</div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#e6edf3', marginBottom: '6px' }}>
                  Drag &amp; Drop your video here
                </div>
                <div style={{ fontSize: '13px', color: '#8b949e', marginBottom: '14px' }}>or</div>
                <div style={{
                  display: 'inline-block', padding: '8px 22px',
                  background: 'var(--accent-blue)', color: 'white',
                  borderRadius: '7px', fontSize: '13px', fontWeight: '600',
                }}>Browse Files</div>
                <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '12px', lineHeight: 1.6 }}>
                  Supported: MP4, MOV, AVI, MKV<br />Maximum: 2 GB
                </div>
              </>
            )}
          </div>

          {/* Zone selection */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#e6edf3', display: 'block', marginBottom: '7px' }}>
              Zone
            </label>
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              style={{
                width: '100%', padding: '9px 12px',
                background: 'var(--bg-primary)', border: '1px solid var(--border)',
                borderRadius: '7px', color: '#e6edf3', fontSize: '13px', outline: 'none',
                cursor: 'pointer',
              }}
            >
              {ZONE_OPTIONS.map(z => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
          </div>



          {/* Upload progress */}
          {uploading && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span style={{ fontSize: '12px', color: '#8b949e' }}>Uploading…</span>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#6366f1' }}>{uploadProgress}%</span>
              </div>
              <div style={{ height: '6px', background: 'var(--bg-primary)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${uploadProgress}%`,
                  background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                  borderRadius: '3px', transition: 'width 0.3s',
                }} />
              </div>
            </div>
          )}

          {/* AI analysis progress banner */}
          {lastStatus === 'processing' && (
            <div style={{
              marginBottom: '14px', padding: '14px',
              background: 'rgba(99,102,241,0.1)',
              border: '1px solid rgba(99,102,241,0.3)',
              borderRadius: '8px', fontSize: '13px', color: '#818cf8',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
                <span style={{ fontWeight: '600' }}>Analyzing Video...</span>
              </div>

              {/* Progress bar */}
              {analysisProgress[lastUploadId] && (
                <>
                  <div style={{
                    height: '6px', background: 'rgba(99,102,241,0.2)',
                    borderRadius: '3px', overflow: 'hidden', marginBottom: '8px',
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.min(analysisProgress[lastUploadId].progress || 0, 100)}%`,
                      background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                      borderRadius: '3px',
                      transition: 'width 0.5s ease',
                    }} />
                  </div>

                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    fontSize: '11px', color: '#8b949e',
                  }}>
                    <span>{analysisProgress[lastUploadId].progress?.toFixed(0) || 0}%</span>
                    {analysisProgress[lastUploadId].inference_fps > 0 && (
                      <span>
                        {analysisProgress[lastUploadId].inference_fps?.toFixed(1) || '?'} FPS
                      </span>
                    )}
                    {analysisProgress[lastUploadId].fps > 0 && (
                      <span>{analysisProgress[lastUploadId].processed_frames} / {analysisProgress[lastUploadId].total_frames} frames</span>
                    )}
                    {analysisProgress[lastUploadId].elapsed_sec > 30 && (
                      <span>~{analysisProgress[lastUploadId].elapsed_sec?.toFixed(0) || '?'}s elapsed</span>
                    )}
                  </div>
                </>
              )}

              {!analysisProgress[lastUploadId] && (
                <div style={{ fontSize: '11px', color: '#8b949e' }}>
                  Starting analysis... This may take 1-2 minutes for CPU processing.
                </div>
              )}
            </div>
          )}

          {/* Start Analysis button */}
          <button
            onClick={handleStartAnalysis}
            disabled={uploading || !selectedFile || lastStatus === 'processing'}
            style={{
              width: '100%', padding: '12px',
              background: (uploading || !selectedFile || lastStatus === 'processing')
                ? 'rgba(99,102,241,0.3)'
                : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: 'white', fontWeight: '700', fontSize: '14px',
              border: 'none', borderRadius: '8px',
              cursor: (uploading || !selectedFile) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              transition: 'all 0.2s',
            }}
          >
            {uploading
              ? `⏳ Uploading… ${uploadProgress}%`
              : lastStatus === 'processing'
              ? `🤖 Analyzing ${analysisProgress[lastUploadId]?.progress?.toFixed(0) || '…'}%`
              : '▶  Upload & Start Analysis'}
          </button>


          {/* Analysis result card — appears when AI finishes */}
          {lastResult && (
             <AnalysisResultCard
               summary={lastResult}
               videoName={videos.find(v => v.id === lastUploadId)?.original_name}
             />
          )}

        </div>

        {/* ── MIDDLE: Video Preview ── */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#e6edf3', marginBottom: '16px' }}>
            Video Preview
          </h2>

          <div style={{
            width: '100%', aspectRatio: '16/9',
            background: '#000', borderRadius: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--border)', marginBottom: '14px', overflow: 'hidden',
          }}>
            {previewUrl ? (
              <video src={previewUrl} controls style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <div style={{ textAlign: 'center', color: '#8b949e' }}>
                <div style={{ fontSize: '44px', marginBottom: '10px' }}>▶️</div>
                <div style={{ fontSize: '13px' }}>Select a video to preview</div>
              </div>
            )}
          </div>

          {/* File info row */}
          {selectedFile && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 12px', background: 'var(--bg-primary)',
              borderRadius: '8px', marginBottom: '16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  padding: '3px 8px', background: 'rgba(59,130,246,0.2)',
                  borderRadius: '5px', fontSize: '11px', fontWeight: '700', color: '#3b82f6',
                }}>
                  {selectedFile.name.split('.').pop().toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#e6edf3' }}>
                    {selectedFile.name.length > 24 ? selectedFile.name.slice(0, 22) + '…' : selectedFile.name}
                  </div>
                  <div style={{ fontSize: '11px', color: '#8b949e' }}>{fileSizeMB} MB</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={() => changeFileInputRef.current?.click()}
                  style={{
                    background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
                    borderRadius: '6px', padding: '5px 10px',
                    color: '#818cf8', fontSize: '12px', cursor: 'pointer',
                  }}
                >🔄 Change</button>
                <button
                  onClick={() => {
                    setSelectedFile(null)
                    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null) }
                  }}
                  style={{
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: '6px', padding: '5px 10px',
                    color: '#ef4444', fontSize: '12px', cursor: 'pointer',
                  }}
                >🗑 Remove</button>
              </div>
              <input
                ref={changeFileInputRef}
                type="file"
                accept=".mp4,.mov,.avi,.mkv"
                style={{ display: 'none' }}
                onChange={(e) => e.target.files[0] && validateAndSetFile(e.target.files[0])}
              />
            </div>
          )}

          {/* Detection Classes */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#e6edf3', marginBottom: '10px' }}>
              Detection Classes
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                { icon: '👤', label: 'Person',      color: '#3b82f6' },
                { icon: '⛑️',  label: 'Helmet',      color: '#22c55e' },
                { icon: '🦺', label: 'Safety Vest', color: '#f97316' },
              ].map(cls => (
                <div key={cls.label} style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '5px 12px',
                  background: `${cls.color}18`, border: `1px solid ${cls.color}40`,
                  borderRadius: '20px', fontSize: '12px', color: cls.color,
                }}>
                  {cls.icon} {cls.label}
                </div>
              ))}
            </div>
          </div>

          {/* Upload AI Report — appears after analysis completes and report generates */}
          {(lastStatus === 'completed' || uploadInsights[lastUploadId]) && (
            <div style={{ marginTop: '16px' }}>
              <UploadAIReport
                report={uploadInsights[lastUploadId]}
                loading={uploadInsightLoading[lastUploadId]}
                videoName={lastVideo?.original_name}
              />
              {uploadInsightError[lastUploadId] && (
                <div style={{
                  marginTop: '8px', padding: '8px 12px',
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: '8px', fontSize: '11px', color: '#ef4444',
                }}>
                  {uploadInsightError[lastUploadId]}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT: Previous Analyses ── */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#e6edf3' }}>Previous Analyses</h2>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: '#8b949e' }}>{videos.length} total</span>
              {videos.length > 0 && (
                <button
                  onClick={deleteAllVideos}
                  style={{
                    padding: '3px 10px',
                    background: 'rgba(239,68,68,0.12)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: '6px', color: '#ef4444',
                    fontSize: '11px', cursor: 'pointer', fontWeight: '600',
                  }}
                >🗑 Delete All</button>
              )}
            </div>
          </div>

          {loadingList ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: '#8b949e', fontSize: '13px' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>⏳</div>Loading…
            </div>
          ) : videos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: '#8b949e', fontSize: '13px' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📂</div>
              No videos uploaded yet.<br />Upload your first video!
            </div>
          ) : (
              videos.slice(0, 8).map(v => (
                <PreviousItem
                  key={v.id}
                  video={v}
                  onDelete={deleteVideo}
                  onAnalyze={startAnalysis}
                  onView={loadPreviousAnalysis}
                  analyzing={analysisStatus[v.id] === 'processing'}
                />
              ))
          )}

          {/* Tips */}
          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#e6edf3', marginBottom: '10px' }}>
              📋 Upload Tips
            </div>
            {[
              'Use videos with clear visibility for best detection.',
              'Good lighting improves accuracy significantly.',
              'Supported: MP4, MOV, AVI, MKV — max 2 GB.',
              
            ].map((tip, i) => (
              <div key={i} style={{ fontSize: '11px', color: '#8b949e', marginBottom: '6px', display: 'flex', gap: '6px' }}>
                <span style={{ flexShrink: 0, color: '#6366f1' }}>•</span><span>{tip}</span>
              </div>
            ))}
          </div>
         </div>

       </div>

       {/* ── Detection Output Section (shown after analysis completes) ── */}
       {lastFullData && lastStatus === 'completed' && (
         <div style={{ marginTop: '24px' }}>
           <div style={{
             background: 'var(--bg-secondary)',
             border: '1px solid var(--border)',
             borderRadius: '12px',
             padding: '24px',
           }}>
             <div style={{
               display: 'flex',
               justifyContent: 'space-between',
               alignItems: 'center',
               marginBottom: '16px',
             }}>
               <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#e6edf3', margin: 0 }}>
                 🔍 Detection Output
               </h2>
               <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                 {hasFrameDetections && (
                   <span style={{
                     fontSize: '11px',
                     padding: '4px 10px',
                     background: 'rgba(34,197,94,0.15)',
                     color: '#22c55e',
                     borderRadius: '12px',
                     fontWeight: '600',
                   }}>
                     Live Canvas Overlay Active
                   </span>
                 )}
                  {frameDetections.length > 0 && (
                    <span style={{ fontSize: '11px', color: '#8b949e' }}>
                      {frameDetections.length} frames • {(lastFullData?.processing_fps || 0).toFixed(1)} FPS
                    </span>
                  )}
               </div>
             </div>

             <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
               {/* ── LEFT: Video Player with Canvas Overlay ── */}
               <div>
                 <div style={{
                   position: 'relative',
                   width: '100%',
                   aspectRatio: '16/9',
                   background: '#000',
                   borderRadius: '10px',
                   overflow: 'hidden',
                   border: '1px solid var(--border)',
                 }}>
                   {displayVideoUrl ? (
                     <>
                       <video
                         ref={outputVideoRef}
                         controls
                         src={displayVideoUrl}
                         style={{
                           width: '100%',
                           height: '100%',
                           objectFit: 'contain',
                         }}
                       />
                       {hasFrameDetections && (
                         <canvas
                           ref={outputCanvasRef}
                           style={{
                             position: 'absolute',
                             top: 0,
                             left: 0,
                             width: '100%',
                             height: '100%',
                             pointerEvents: 'none',
                           }}
                         />
                       )}
                     </>
                   ) : (
                     <div style={{
                       display: 'flex',
                       flexDirection: 'column',
                       alignItems: 'center',
                       justifyContent: 'center',
                       height: '100%',
                       color: '#8b949e',
                     }}>
                       <div style={{ fontSize: '36px', marginBottom: '10px' }}>🎬</div>
                       <div style={{ fontSize: '13px' }}>Video will appear here after upload</div>
                     </div>
                   )}

                   {/* Stats overlay */}
                   {displayVideoUrl && outputPlaying && (
                     <div style={{
                       position: 'absolute',
                       bottom: '50px',
                       right: '12px',
                       background: 'rgba(0,0,0,0.75)',
                       borderRadius: '6px',
                       padding: '6px 10px',
                       fontSize: '11px',
                       color: 'white',
                     }}>
                       <div>Workers: <strong>{currentOutputStats.total}</strong></div>
                       <div>Violations: <strong style={{ color: '#ef4444' }}>{currentOutputStats.violations}</strong></div>
                     </div>
                   )}
                 </div>

                  {/* Video info */}
                  {lastFullData?.video_info && (
                    <div style={{
                      marginTop: '12px',
                      padding: '10px 14px',
                      background: 'var(--bg-primary)',
                      borderRadius: '8px',
                      display: 'flex',
                      gap: '16px',
                      flexWrap: 'wrap',
                      fontSize: '12px',
                      color: '#8b949e',
                    }}>
                      <span>📐 {lastFullData.video_info.width} × {lastFullData.video_info.height}</span>
                      <span>🎞️ {lastFullData.video_info.fps?.toFixed(1) || 30} FPS</span>
                      <span>⏱️ {lastFullData.video_info.duration_sec?.toFixed(1) || 0}s</span>
                      <span>⚙️ {lastFullData.processing_time_sec?.toFixed(1) || 0}s</span>
                      {lastFullData.avg_inference_time_ms > 0 && (
                        <span>⚡ {lastFullData.avg_inference_time_ms?.toFixed(0) || '?'}ms/infer</span>
                      )}
                      {lastFullData.processing_fps > 0 && (
                        <span>🚀 {lastFullData.processing_fps?.toFixed(1) || '?'} proc FPS</span>
                      )}
                    </div>
                  )}
               </div>

               {/* ── RIGHT: Live Detections Panel ── */}
               <div>
                 <div style={{
                   background: 'var(--bg-primary)',
                   borderRadius: '10px',
                   padding: '16px',
                   height: '100%',
                   minHeight: '300px',
                   display: 'flex',
                   flexDirection: 'column',
                 }}>
                   <div style={{
                     display: 'flex',
                     justifyContent: 'space-between',
                     alignItems: 'center',
                     marginBottom: '12px',
                   }}>
                     <h3 style={{
                       fontSize: '13px',
                       fontWeight: '600',
                       color: '#e6edf3',
                       margin: 0,
                     }}>
                       Current Detections
                     </h3>
                     {currentOutputDetections.length > 0 && (
                       <span style={{
                         fontSize: '11px',
                         fontWeight: '600',
                         color: '#6366f1',
                       }}>
                         {currentOutputDetections.length} detected
                       </span>
                     )}
                   </div>

                   <div style={{ flex: 1, overflowY: 'auto' }}>
                     {!displayVideoUrl ? (
                       <div style={{
                         textAlign: 'center',
                         padding: '40px 20px',
                         color: '#8b949e',
                         fontSize: '12px',
                       }}>
                         <div style={{ fontSize: '28px', marginBottom: '8px' }}>👁️</div>
                         Upload and analyze a video to see detections
                       </div>
                     ) : currentOutputDetections.length === 0 ? (
                       <div style={{
                         textAlign: 'center',
                         padding: '40px 20px',
                         color: '#8b949e',
                         fontSize: '12px',
                       }}>
                         <div style={{ fontSize: '28px', marginBottom: '8px' }}>▶️</div>
                         Play the video to see live detections
                       </div>
                     ) : (
                       currentOutputDetections.map((det, idx) => (
                         <DetectionItem key={`${det.worker_id}-${idx}`} det={det} />
                       ))
                     )}
                   </div>

                   {/* Summary stats */}
                   {lastFullData?.summary && (
                     <div style={{
                       marginTop: '16px',
                       paddingTop: '16px',
                       borderTop: '1px solid var(--border)',
                     }}>
                       <div style={{
                         display: 'grid',
                         gridTemplateColumns: '1fr 1fr',
                         gap: '8px',
                         marginBottom: '12px',
                       }}>
                         <div style={{
                           textAlign: 'center',
                           padding: '10px',
                           background: 'rgba(34,197,94,0.1)',
                           borderRadius: '8px',
                         }}>
                           <div style={{ fontSize: '18px', fontWeight: '700', color: '#22c55e' }}>
                             {lastFullData.summary.compliant_workers || 0}
                           </div>
                           <div style={{ fontSize: '10px', color: '#8b949e' }}>Compliant</div>
                         </div>
                         <div style={{
                           textAlign: 'center',
                           padding: '10px',
                           background: 'rgba(239,68,68,0.1)',
                           borderRadius: '8px',
                         }}>
                           <div style={{ fontSize: '18px', fontWeight: '700', color: '#ef4444' }}>
                             {lastFullData.summary.violation_workers || 0}
                           </div>
                           <div style={{ fontSize: '10px', color: '#8b949e' }}>Violations</div>
                         </div>
                       </div>
                       <div style={{
                         textAlign: 'center',
                         padding: '10px',
                         background: 'rgba(99,102,241,0.1)',
                         borderRadius: '8px',
                       }}>
                         <div style={{ fontSize: '20px', fontWeight: '700', color: '#6366f1' }}>
                           {lastFullData.summary.compliance_rate || 0}%
                         </div>
                         <div style={{ fontSize: '11px', color: '#8b949e' }}>Compliance Rate</div>
                       </div>
                     </div>
                   )}
                 </div>
               </div>
             </div>

             {/* Worker Summary Section */}
             {lastFullData?.workers && lastFullData.workers.length > 0 && (
               <div style={{ marginTop: '20px' }}>
                 <h3 style={{
                   fontSize: '13px',
                   fontWeight: '600',
                   color: '#e6edf3',
                   marginBottom: '12px',
                 }}>
                   📋 All Tracked Workers ({lastFullData.workers.length} total)
                 </h3>
                 <div style={{
                   display: 'grid',
                   gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                   gap: '8px',
                 }}>
                   {lastFullData.workers.map((worker) => {
                     const isViolation = worker.violation !== 'none' && worker.severity !== 'safe'
                     const color = worker.color_hex || (isViolation ? '#ef4444' : '#22c55e')
                     return (
                       <div key={worker.worker_id} style={{
                         display: 'flex',
                         alignItems: 'center',
                         gap: '10px',
                         padding: '10px 12px',
                         background: `${color}10`,
                         border: `1px solid ${color}30`,
                         borderRadius: '8px',
                       }}>
                         <div style={{
                           width: '10px',
                           height: '10px',
                           borderRadius: '50%',
                           background: color,
                           flexShrink: 0,
                         }} />
                         <div style={{ flex: 1, minWidth: 0 }}>
                           <div style={{
                             fontSize: '12px',
                             fontWeight: '600',
                             color: '#e6edf3',
                           }}>
                             Worker #{worker.worker_id}
                           </div>
                           <div style={{ fontSize: '11px', color }}>
                             {worker.label || (isViolation ? 'Violation' : 'Compliant')}
                           </div>
                         </div>
                         <div style={{ fontSize: '13px' }}>
                           {worker.has_helmet ? '⛑️' : '❌'}
                           {worker.has_vest ? '🦺' : '❌'}
                         </div>
                       </div>
                     )
                   })}
                 </div>
               </div>
             )}
           </div>
         </div>
       )}

       <style>{`
         @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
       `}</style>
     </div>
   )
 }