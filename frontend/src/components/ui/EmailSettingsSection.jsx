// ============================================================
// SafeSite AI — Email Settings Section  (Phase 8)
// File: frontend/src/components/ui/EmailSettingsSection.jsx
//
// Shows:
//  - Whether email is configured (green/red status)
//  - Setup instructions if not configured
//  - Test email button (sends to a specified address)
//  - Link to the .env file for configuration
// ============================================================

import { useState, useEffect } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'

export default function EmailSettingsSection() {
  const [status,       setStatus]       = useState(null)   // email config status from backend
  const [loading,      setLoading]      = useState(true)
  const [testEmail,    setTestEmail]    = useState('')
  const [sendingTest,  setSendingTest]  = useState(false)

  // Load email configuration status from the backend
  useEffect(() => {
    loadStatus()
  }, [])

  async function loadStatus() {
    setLoading(true)
    try {
      const res = await api.get('/email/status')
      setStatus(res.data)
    } catch (err) {
      console.error('Could not load email status:', err)
      setStatus({ configured: false, enabled: false })
    } finally {
      setLoading(false)
    }
  }

  async function sendTestEmail() {
    if (!testEmail.trim()) {
      toast.error('Enter a recipient email address')
      return
    }
    if (!testEmail.includes('@')) {
      toast.error('Enter a valid email address')
      return
    }

    setSendingTest(true)
    try {
      await api.post('/email/test', { recipient: testEmail })
      toast.success(`✅ Test email sent to ${testEmail}! Check your inbox.`)
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to send test email'
      toast.error(msg)
    } finally {
      setSendingTest(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '20px', color: '#8b949e', fontSize: '13px' }}>
        Loading email configuration…
      </div>
    )
  }

  const isConfigured = status?.configured
  const isEnabled    = status?.enabled

  return (
    <div>

      {/* ── Status banner ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '14px 16px', marginBottom: '20px',
        background: isConfigured
          ? 'rgba(34,197,94,0.08)'
          : 'rgba(239,68,68,0.08)',
        border: `1px solid ${isConfigured ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
        borderRadius: '10px',
      }}>
        <span style={{ fontSize: '22px' }}>
          {isConfigured ? '✅' : '❌'}
        </span>
        <div>
          <div style={{
            fontSize: '13px', fontWeight: '700',
            color: isConfigured ? '#22c55e' : '#ef4444',
            marginBottom: '2px',
          }}>
            {isConfigured ? 'Email Configured & Ready' : 'Email Not Configured'}
          </div>
          <div style={{ fontSize: '12px', color: '#8b949e' }}>
            {isConfigured
              ? `Sending from: ${status.mail_from} via ${status.mail_server}:${status.mail_port}`
              : 'Add Gmail credentials to backend/.env to enable email alerts'}
          </div>
        </div>
        <button
          onClick={loadStatus}
          style={{
            marginLeft: 'auto', padding: '5px 12px',
            background: 'var(--bg-primary)', border: '1px solid var(--border)',
            borderRadius: '6px', color: '#8b949e', fontSize: '12px', cursor: 'pointer',
          }}
        >↻ Refresh</button>
      </div>

      {/* ── Not configured: show setup guide ── */}
      {!isConfigured && (
        <div style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: '10px', padding: '18px', marginBottom: '20px',
        }}>
          <div style={{
            fontSize: '13px', fontWeight: '600', color: '#e6edf3',
            marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <span>📋</span> How to Set Up Gmail Email Alerts
          </div>

          {[
            {
              step: '1',
              title: 'Enable 2-Step Verification',
              desc: 'Go to myaccount.google.com → Security → 2-Step Verification → Turn On',
            },
            {
              step: '2',
              title: 'Create an App Password',
              desc: 'Go to Security → App Passwords → Select "Mail" → Device "Other" → Name it "SafeSite AI" → Generate',
            },
            {
              step: '3',
              title: 'Open backend/.env',
              desc: 'Add your Gmail address and the 16-character App Password (without spaces)',
            },
            {
              step: '4',
              title: 'Restart the backend server',
              desc: 'Stop and restart: uvicorn main:socket_app --reload --port 8000',
            },
            {
              step: '5',
              title: 'Send a test email below',
              desc: 'Use the Test Email button to verify everything works.',
            },
          ].map(item => (
            <div key={item.step} style={{
              display: 'flex', gap: '12px', marginBottom: '12px',
            }}>
              <div style={{
                width: '24px', height: '24px', flexShrink: 0,
                background: 'rgba(99,102,241,0.2)',
                border: '1px solid rgba(99,102,241,0.4)',
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: '700', color: '#818cf8',
              }}>{item.step}</div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#e6edf3', marginBottom: '2px' }}>
                  {item.title}
                </div>
                <div style={{ fontSize: '12px', color: '#8b949e', lineHeight: 1.5 }}>
                  {item.desc}
                </div>
              </div>
            </div>
          ))}

          {/* .env snippet */}
          <div style={{
            marginTop: '14px', padding: '12px',
            background: '#0d1117', borderRadius: '8px',
            border: '1px solid #30363d', fontFamily: 'monospace',
            fontSize: '12px', color: '#22c55e', lineHeight: 1.7,
          }}>
            <div style={{ color: '#8b949e', marginBottom: '4px' }}># backend/.env</div>
            <div>MAIL_USERNAME=<span style={{ color: '#e6edf3' }}>you@gmail.com</span></div>
            <div>MAIL_PASSWORD=<span style={{ color: '#e6edf3' }}>abcdefghijklmnop</span></div>
            <div>MAIL_FROM=<span style={{ color: '#e6edf3' }}>you@gmail.com</span></div>
            <div>ALERT_RECIPIENTS=<span style={{ color: '#e6edf3' }}>you@gmail.com</span></div>
            <div>EMAIL_ALERTS_ENABLED=<span style={{ color: '#e6edf3' }}>true</span></div>
          </div>
        </div>
      )}

      {/* ── Configured: show current settings ── */}
      {isConfigured && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px',
          marginBottom: '20px',
        }}>
          {[
            { label: 'Mail Server',  value: `${status.mail_server}:${status.mail_port}` },
            { label: 'Send From',    value: status.mail_from },
            { label: 'Recipients',  value: status.recipients },
            { label: 'Status',      value: isEnabled ? 'Enabled' : 'Disabled' },
          ].map(row => (
            <div key={row.label} style={{
              padding: '10px 14px',
              background: 'var(--bg-primary)', border: '1px solid var(--border)',
              borderRadius: '8px',
            }}>
              <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '3px' }}>
                {row.label}
              </div>
              <div style={{
                fontSize: '13px', fontWeight: '600', color: '#e6edf3',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {row.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Send test email ── */}
      <div style={{
        background: 'var(--bg-primary)', border: '1px solid var(--border)',
        borderRadius: '10px', padding: '16px',
      }}>
        <div style={{
          fontSize: '13px', fontWeight: '600', color: '#e6edf3',
          marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <span>📤</span> Send Test Email
        </div>
        <div style={{ fontSize: '12px', color: '#8b949e', marginBottom: '12px' }}>
          Sends a sample HIGH severity alert email to verify your configuration.
          {!isConfigured && ' Configure your email credentials first.'}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="email"
            value={testEmail}
            onChange={e => setTestEmail(e.target.value)}
            placeholder="Recipient email (e.g. admin@company.com)"
            disabled={!isConfigured}
            onKeyDown={e => e.key === 'Enter' && sendTestEmail()}
            style={{
              flex: 1, padding: '9px 12px',
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: '7px', color: '#e6edf3', fontSize: '13px', outline: 'none',
              opacity: isConfigured ? 1 : 0.5,
            }}
          />
          <button
            onClick={sendTestEmail}
            disabled={!isConfigured || sendingTest}
            style={{
              padding: '9px 18px',
              background: !isConfigured || sendingTest
                ? 'rgba(99,102,241,0.2)'
                : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              border: 'none', borderRadius: '7px',
              color: 'white', fontWeight: '600', fontSize: '13px',
              cursor: !isConfigured || sendingTest ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {sendingTest ? '⏳ Sending…' : '📧 Send Test'}
          </button>
        </div>
      </div>

      {/* ── What triggers an email ── */}
      <div style={{
        marginTop: '16px', padding: '14px',
        background: 'rgba(249,115,22,0.06)',
        border: '1px solid rgba(249,115,22,0.2)',
        borderRadius: '10px', fontSize: '12px', color: '#8b949e', lineHeight: 1.7,
      }}>
        <strong style={{ color: '#f97316' }}>⚡ When are emails sent?</strong><br />
        Emails are sent automatically for every <strong style={{ color: '#ef4444' }}>HIGH severity</strong> alert
        (worker missing both helmet AND vest). Medium severity alerts (missing one item) only
        show a toast notification and sound alert. You can adjust this threshold in the{' '}
        <a href="/settings" style={{ color: '#6366f1', textDecoration: 'none' }}>Alert Settings</a> section.
      </div>

    </div>
  )
}