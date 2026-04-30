import { useState, useRef } from 'react'
import { useVideoUpload } from '../../hooks/useVideoUpload'
import toast from 'react-hot-toast'

export default function VideoUploadPage() {
  const [dragActive, setDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [zone, setZone] = useState('Zone A')
  const [streamUrl, setStreamUrl] = useState('')
  const [cameraName, setCameraName] = useState('Camera 1')
  const fileInputRef = useRef(null)

  const {
    videos,
    loadingList,
    uploading,
    uploadProgress,
    uploadFile,
    registerStream,
    deleteVideo,
    refreshVideos,
  } = useVideoUpload()

  function handleDrag(e) {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    else if (e.type === 'dragleave') setDragActive(false)
  }

  function handleDrop(e) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files?.length) {
      setSelectedFile(e.dataTransfer.files[0])
    }
  }

  function handleChange(e) {
    if (e.target.files?.length) {
      setSelectedFile(e.target.files[0])
      e.target.value = ''
    }
  }

  async function handleUpload() {
    if (!selectedFile) {
      toast.error('Please select a video file')
      return
    }
    const result = await uploadFile(selectedFile, zone)
    if (result) {
      setSelectedFile(null)
    }
  }

  async function handleRegisterStream(e) {
    e.preventDefault()
    await registerStream(streamUrl, zone, cameraName)
    setStreamUrl('')
    setCameraName('Camera 1')
  }

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '12px', color: '#8b949e', marginBottom: '4px' }}>
          Dashboard &rsaquo; Video Upload
        </div>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#e6edf3' }}>Video Upload</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#e6edf3', marginBottom: '16px' }}>Upload Video</h3>

          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragActive ? 'var(--accent-blue)' : 'var(--border)'}`,
              borderRadius: '12px',
              padding: '40px',
              textAlign: 'center',
              background: dragActive ? 'rgba(59,130,246,0.05)' : 'transparent',
              cursor: 'pointer',
              marginBottom: '16px',
            }}
          >
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🎬</div>
            <div style={{ fontSize: '14px', color: '#e6edf3', marginBottom: '8px' }}>
              {selectedFile ? selectedFile.name : 'Drag & drop video file here'}
            </div>
            <div style={{ fontSize: '12px', color: '#8b949e', marginBottom: '16px' }}>
              Supports MP4, AVI, MOV formats
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                fileInputRef.current?.click()
              }}
              style={{
                padding: '8px 20px',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                border: 'none',
                borderRadius: '7px',
                color: 'white',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Browse Files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleChange}
              style={{
                position: 'absolute',
                opacity: 0,
                width: 0,
                height: 0,
                overflow: 'hidden',
              }}
            />
          </div>

          {selectedFile && (
            <div style={{ marginBottom: '16px', padding: '10px', background: 'var(--bg-primary)', borderRadius: '8px' }}>
              <div style={{ fontSize: '13px', color: '#e6edf3' }}>{selectedFile.name}</div>
              <div style={{ fontSize: '11px', color: '#8b949e' }}>
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </div>
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', color: '#8b949e', display: 'block', marginBottom: '4px' }}>Zone</label>
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: '7px',
                color: '#e6edf3',
                fontSize: '13px',
              }}
            >
              <option value="Zone A">Zone A</option>
              <option value="Zone B">Zone B</option>
              <option value="Zone C">Zone C</option>
            </select>
          </div>

          {uploading && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: '#8b949e', marginBottom: '4px' }}>
                Uploading... {uploadProgress}%
              </div>
              <div style={{
                width: '100%',
                height: '6px',
                background: 'var(--bg-primary)',
                borderRadius: '3px',
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${uploadProgress}%`,
                  height: '100%',
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  transition: 'width 0.3s',
                }} />
              </div>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={uploading || !selectedFile}
            style={{
              width: '100%',
              padding: '10px',
              background: uploading || !selectedFile ? 'var(--bg-hover)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              border: 'none',
              borderRadius: '7px',
              color: uploading || !selectedFile ? '#8b949e' : 'white',
              fontSize: '14px',
              fontWeight: '600',
              cursor: uploading || !selectedFile ? 'not-allowed' : 'pointer',
            }}
          >
            {uploading ? `Uploading... ${uploadProgress}%` : 'Upload Video'}
          </button>
        </div>

        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#e6edf3', marginBottom: '16px' }}>Register Live Stream</h3>

          <form onSubmit={handleRegisterStream} style={{ marginBottom: '20px' }}>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', color: '#8b949e', display: 'block', marginBottom: '4px' }}>
                Stream URL (.m3u8 or RTSP)
              </label>
              <input
                type="text"
                value={streamUrl}
                onChange={(e) => setStreamUrl(e.target.value)}
                placeholder="https://example.com/stream.m3u8"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: '7px',
                  color: '#e6edf3',
                  fontSize: '13px',
                }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', color: '#8b949e', display: 'block', marginBottom: '4px' }}>
                Camera Name
              </label>
              <input
                type="text"
                value={cameraName}
                onChange={(e) => setCameraName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: '7px',
                  color: '#e6edf3',
                  fontSize: '13px',
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', color: '#8b949e', display: 'block', marginBottom: '4px' }}>Zone</label>
              <select
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: '7px',
                  color: '#e6edf3',
                  fontSize: '13px',
                }}
              >
                <option value="Zone A">Zone A</option>
                <option value="Zone B">Zone B</option>
                <option value="Zone C">Zone C</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={!streamUrl.trim()}
              style={{
                width: '100%',
                padding: '10px',
                background: !streamUrl.trim() ? 'var(--bg-hover)' : 'linear-gradient(135deg, #10b981, #059669)',
                border: 'none',
                borderRadius: '7px',
                color: !streamUrl.trim() ? '#8b949e' : 'white',
                fontSize: '14px',
                fontWeight: '600',
                cursor: !streamUrl.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              Register Stream
            </button>
          </form>

          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#e6edf3', marginBottom: '16px' }}>Upload History</h3>

          {loadingList ? (
            <div style={{ fontSize: '13px', color: '#8b949e', textAlign: 'center', padding: '20px 0' }}>
              Loading...
            </div>
          ) : videos.length === 0 ? (
            <div style={{ fontSize: '13px', color: '#8b949e', textAlign: 'center', padding: '20px 0' }}>
              No uploads yet
            </div>
          ) : (
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {videos.map((video) => (
                <div key={video._id || video.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px', background: 'var(--bg-primary)', borderRadius: '8px', marginBottom: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '18px' }}>{video.type === 'stream' ? '📡' : '🎥'}</span>
                    <div>
                      <div style={{ fontSize: '13px', color: '#e6edf3' }}>
                        {video.original_name || video.camera_name || 'Unknown'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#8b949e' }}>
                        {video.zone} • {video.status}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteVideo(video._id || video.id, video.original_name || video.camera_name)}
                    style={{
                      background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px',
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
