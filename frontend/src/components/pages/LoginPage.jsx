import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [email, setEmail] = useState('admin@safesite.com')
  const [password, setPassword] = useState('admin123')
  const [loading, setLoading] = useState(false)

  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const user = await login(email, password)
      toast.success(`Welcome back, ${user.name}! 👷`)
      navigate('/dashboard')
    } catch (err) {
      const msg = err.response?.data?.detail || 'Login failed. Check your credentials.'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      {/* Background grid pattern */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        backgroundImage: `
          linear-gradient(rgba(59,130,246,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(59,130,246,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
      }} />

      <div style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: '420px',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '12px',
            marginBottom: '12px',
          }}>
            <div style={{
              width: '48px', height: '48px',
              background: 'linear-gradient(135deg, #f97316, #ea580c)',
              borderRadius: '12px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '24px',
              boxShadow: '0 0 30px rgba(249,115,22,0.3)',
            }}>
              🦺
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '22px', fontWeight: '700', color: '#e6edf3' }}>
                SafeSite <span style={{ color: '#f97316' }}>AI</span>
              </div>
              <div style={{ fontSize: '12px', color: '#8b949e' }}>Construction Safety Monitoring</div>
            </div>
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '36px',
        }}>
          <h1 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '6px', color: '#e6edf3' }}>
            Sign in to your account
          </h1>
          <p style={{ fontSize: '14px', color: '#8b949e', marginBottom: '28px' }}>
            Monitor your construction site safety in real-time
          </p>

          <form onSubmit={handleSubmit}>
            {/* Email */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{
                display: 'block', fontSize: '13px', fontWeight: '500',
                color: '#e6edf3', marginBottom: '8px'
              }}>
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@safesite.com"
                style={{
                  width: '100%', padding: '11px 14px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px', color: '#e6edf3',
                  fontSize: '14px', outline: 'none',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block', fontSize: '13px', fontWeight: '500',
                color: '#e6edf3', marginBottom: '8px'
              }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{
                  width: '100%', padding: '11px 14px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px', color: '#e6edf3',
                  fontSize: '14px', outline: 'none',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '12px',
                background: loading ? '#1d4ed8' : 'var(--accent-blue)',
                color: 'white', fontWeight: '600',
                fontSize: '15px', borderRadius: '8px',
                border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                opacity: loading ? 0.8 : 1,
              }}
            >
              {loading ? '⏳ Signing in...' : '🔐 Sign In'}
            </button>
          </form>

          {/* Demo credentials hint */}
          <div style={{
            marginTop: '20px', padding: '12px',
            background: 'rgba(59,130,246,0.08)',
            border: '1px solid rgba(59,130,246,0.2)',
            borderRadius: '8px', fontSize: '12px', color: '#8b949e',
          }}>
            <strong style={{ color: '#3b82f6' }}>Demo Credentials:</strong><br />
            Email: admin@safesite.com<br />
            Password: admin123
          </div>
        </div>

        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '12px', color: '#8b949e' }}>
          SafeSite AI v2.0 — Construction Safety Monitoring System
        </p>
      </div>
    </div>
  )
}