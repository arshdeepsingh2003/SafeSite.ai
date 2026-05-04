// ============================================================
// SafeSite AI — Video Upload & Analysis Page  (Phase 3 + 4)
// File: frontend/src/components/pages/VideoUploadPage.jsx
// ============================================================

import { useState, useRef, useCallback } from 'react'
import { useVideoUpload } from '../../hooks/useVideoUpload'
import { useAnalysis }    from '../../hooks/useAnalysis'
import AnalysisResultCard from '../ui/AnalysisResultCard'

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

function PreviousItem({ video, onDelete, onAnalyze, analyzing }) {
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
              onClick={() => onAnalyze(video._id)}
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

          <button
            onClick={() => onDelete(video._id, video.original_name || 'this video')}
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
    uploadFile, registerStream, deleteVideo,
  } = useVideoUpload()

  const { startAnalysis, analysisStatus, analysisResults } = useAnalysis()

  const [dragOver,     setDragOver]     = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl,   setPreviewUrl]   = useState(null)
  const [streamUrl,    setStreamUrl]    = useState('')
  const [zone,         setZone]         = useState('Zone A')
  const [cameraName,   setCameraName]   = useState('Camera 1')
  const [lastUploadId, setLastUploadId] = useState(null)
  const fileInputRef = useRef(null)

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

  async function handleRegisterStream() {
    const result = await registerStream(streamUrl, zone, cameraName)
    if (result) setStreamUrl('')
  }

  const fileSizeMB = selectedFile ? (selectedFile.size / 1024 / 1024).toFixed(1) : null

  // Find the result for the most recently uploaded video
  const lastResult = lastUploadId ? analysisResults[lastUploadId] : null
  const lastStatus = lastUploadId ? analysisStatus[lastUploadId] : null

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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 300px', gap: '20px', alignItems: 'start' }}>

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

          {/* Live stream URL */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#e6edf3', display: 'block', marginBottom: '7px' }}>
              Live Stream URL <span style={{ color: '#8b949e', fontWeight: 400 }}>(Optional — .m3u8 / RTSP)</span>
            </label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input
                value={streamUrl}
                onChange={(e) => setStreamUrl(e.target.value)}
                placeholder="https://example.com/stream.m3u8"
                style={{
                  flex: 1, padding: '9px 12px',
                  background: 'var(--bg-primary)', border: '1px solid var(--border)',
                  borderRadius: '7px', color: '#e6edf3', fontSize: '13px', outline: 'none',
                }}
              />
              <button
                onClick={handleRegisterStream}
                style={{
                  padding: '9px 14px', background: 'var(--bg-primary)',
                  border: '1px solid var(--border)', borderRadius: '7px',
                  color: '#8b949e', cursor: 'pointer', fontSize: '16px',
                }}
              >🔗</button>
            </div>
            
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
              marginBottom: '14px', padding: '12px',
              background: 'rgba(99,102,241,0.1)',
              border: '1px solid rgba(99,102,241,0.3)',
              borderRadius: '8px', fontSize: '13px', color: '#818cf8',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
              <span>AI is analyzing your video… This may take a few minutes.</span>
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
              ? '🤖 AI Analyzing…'
              : '▶  Upload & Start Analysis'}
          </button>


          {/* Analysis result card — appears when AI finishes */}
          {lastResult && (
            <AnalysisResultCard
              summary={lastResult}
              videoName={videos.find(v => v._id === lastUploadId)?.original_name}
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

          {/* How it works */}
          <div style={{
            padding: '16px', background: 'var(--bg-primary)',
            borderRadius: '8px', border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#e6edf3', marginBottom: '12px' }}>
              🤖 How AI Detection Works
            </div>
            {[
              { step: '1', text: 'Video is split into frames by OpenCV' },
              { step: '2', text: 'Every 5th frame is sent to YOLOv8' },
              { step: '3', text: 'Persons, helmets & vests are detected' },
              { step: '4', text: 'PPE is matched to each worker' },
              { step: '5', text: 'Violations are classified by severity' },
              { step: '6', text: 'Bounding boxes are drawn on output video' },
            ].map(item => (
              <div key={item.step} style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px',
                marginBottom: '8px', fontSize: '12px', color: '#8b949e',
              }}>
                <div style={{
                  width: '20px', height: '20px', flexShrink: 0,
                  background: 'rgba(99,102,241,0.2)',
                  border: '1px solid rgba(99,102,241,0.4)',
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '10px', fontWeight: '700', color: '#818cf8',
                }}>{item.step}</div>
                <span style={{ paddingTop: '2px' }}>{item.text}</span>
              </div>
            ))}

            {/* Compliance rules */}
            <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#e6edf3', marginBottom: '8px' }}>
                Compliance Rules
              </div>
              {[
                { rule: 'No Helmet → Violation',          color: '#f97316', sev: 'Medium' },
                { rule: 'No Vest → Violation',             color: '#eab308', sev: 'Medium' },
                { rule: 'No Helmet & No Vest → High Risk', color: '#ef4444', sev: 'High' },
              ].map(item => (
                <div key={item.rule} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: '5px', fontSize: '12px',
                }}>
                  <span style={{ color: item.color }}>• {item.rule}</span>
                  <span style={{
                    fontSize: '10px', fontWeight: '600', padding: '2px 6px',
                    background: `${item.color}20`, color: item.color,
                    borderRadius: '8px',
                  }}>{item.sev}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Previous Analyses ── */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#e6edf3' }}>Previous Analyses</h2>
            <span style={{ fontSize: '11px', color: '#8b949e' }}>{videos.length} total</span>
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
                key={v._id}
                video={v}
                onDelete={deleteVideo}
                onAnalyze={startAnalysis}
                analyzing={analysisStatus[v._id] === 'processing'}
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

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}