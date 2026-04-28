import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { isLoggedIn, isAdmin, loading } = useAuth()

  // While checking localStorage for saved token, show nothing
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-primary)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🦺</div>
          <div style={{ color: '#8b949e', fontSize: '14px' }}>Loading SafeSite AI...</div>
        </div>
      </div>
    )
  }

  // Not logged in → go to login page
  if (!isLoggedIn) {
    return <Navigate to="/login" replace />
  }

  // Admin-only page but user is not admin
  if (adminOnly && !isAdmin) {
    return (
      <div style={{
        padding: '40px', textAlign: 'center', color: '#8b949e'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚫</div>
        <h2 style={{ color: '#e6edf3', marginBottom: '8px' }}>Access Denied</h2>
        <p>You need admin privileges to view this page.</p>
      </div>
    )
  }

  return children
}