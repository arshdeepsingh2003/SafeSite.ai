import { useState } from 'react'

export default function VideoUploadPage() {
  const [dragActive, setDragActive] = useState(false)
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)

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
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
  }

  function handleChange(e) {
    if (e.target.files?.length) handleFiles(e.target.files)
  }

  function handleFiles(fileList) {
    const newFiles = Array.from(fileList).map(f => ({
      name: f.name,
      size: (f.size / (1024 * 1024)).toFixed(2) + ' MB',
      status: 'pending',
    }))
    setFiles(prev => [...prev, ...newFiles])
  }

  function removeFile(index) {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  function uploadFiles() {
    setUploading(true)
    setTimeout(() => {
      setFiles(prev => prev.map(f => ({ ...f, status: 'completed' })))
      setUploading(false)
    }, 2000)
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
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#e6edf3', marginBottom: '16px' }}>Upload Videos</h3>

          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
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
              Drag & drop video files here
            </div>
            <div style={{ fontSize: '12px', color: '#8b949e', marginBottom: '16px' }}>
              Supports MP4, AVI, MOV formats
            </div>
            <label>
              <button style={{
                padding: '8px 20px',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                border: 'none',
                borderRadius: '7px',
                color: 'white',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
              }}>
                Browse Files
              </button>
              <input type="file" multiple accept="video/*" onChange={handleChange} style={{ display: 'none' }} />
            </label>
          </div>

          {files.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#e6edf3', marginBottom: '10px' }}>
                Selected Files ({files.length})
              </div>
              {files.map((file, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px', background: 'var(--bg-primary)', borderRadius: '8px', marginBottom: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '18px' }}>🎥</span>
                    <div>
                      <div style={{ fontSize: '13px', color: '#e6edf3' }}>{file.name}</div>
                      <div style={{ fontSize: '11px', color: '#8b949e' }}>{file.size}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {file.status === 'completed' && <span style={{ color: '#22c55e', fontSize: '12px' }}>✓</span>}
                    {file.status === 'pending' && <span style={{ color: '#8b949e', fontSize: '11px' }}>Pending</span>}
                    <button onClick={() => removeFile(i)} style={{
                      background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px',
                    }}>×</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={uploadFiles}
            disabled={uploading || files.length === 0}
            style={{
              width: '100%',
              padding: '10px',
              background: uploading || files.length === 0 ? 'var(--bg-hover)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              border: 'none',
              borderRadius: '7px',
              color: uploading || files.length === 0 ? '#8b949e' : 'white',
              fontSize: '14px',
              fontWeight: '600',
              cursor: uploading || files.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            {uploading ? 'Uploading...' : `Upload ${files.length} File(s)`}
          </button>
        </div>

        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#e6edf3', marginBottom: '16px' }}>Upload History</h3>
          <div style={{ fontSize: '13px', color: '#8b949e', textAlign: 'center', padding: '40px 0' }}>
            No uploads yet
          </div>
        </div>
      </div>
    </div>
  )
}
