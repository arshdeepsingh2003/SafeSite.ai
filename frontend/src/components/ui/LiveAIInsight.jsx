import { useState, useEffect, useCallback } from 'react'
import { useLLM }       from '../../hooks/useLLM'
import { useStream }    from '../../context/StreamContext'
import { useSocket }    from '../../context/SocketContext'
import AIInsightPanel   from './AIInsightPanel'
import api from '../../services/api'

export default function LiveAIInsight({
  compact      = false,
  autoLoad     = true,
  refreshEvery = 0,
  range        = 'week',
  zone         = 'all',
}) {
  const { analyzeDetections, isConfigured, loadingStatus } = useLLM()
  const { aiInsight, setAiInsight, liveSummary } = useStream()
  const { isConnected } = useSocket()
  const [loading, setLoading]   = useState(false)
  const [lastFetched, setLastFetched] = useState(null)
  const [source, setSource] = useState('polling')

  const fetchInsight = useCallback(async () => {
    if (loading) return
    setLoading(true)
    try {
      const summaryRes = await api.get(`/analytics/summary?range=${range}&zone=${zone}`)
      const s = summaryRes.data

      const totalViolations = s.total_violations ?? 0
      const insightZone = zone !== 'all' ? zone : 'All Zones (Site-wide)'

      const payload = {
        zone:                  insightZone,
        total_workers:         s.total_workers ?? 0,
        compliant:             s.compliant ?? 0,
        no_helmet:             s.no_helmet ?? 0,
        no_vest:               s.no_vest ?? 0,
        no_helmet_and_no_vest: s.no_helmet_and_no_vest ?? 0,
        compliance_rate:       s.compliance_rate ?? 0,
        frames_analyzed:       totalViolations * 10 || 100,
      }

      const result = await analyzeDetections(payload)
      if (result) {
        setAiInsight(result)
        setLastFetched(new Date())
      }
    } catch (err) {
      console.error('Could not load AI insight:', err)
    } finally {
      setLoading(false)
    }
  }, [analyzeDetections, range, zone, loading, setAiInsight])

  useEffect(() => {
    if (isConnected) {
      setSource('socket')
    } else {
      setSource('polling')
    }
  }, [isConnected])

  useEffect(() => {
    if (autoLoad && !loadingStatus) {
      if (!isConnected) {
        fetchInsight()
      }
    }
  }, [autoLoad, loadingStatus, fetchInsight, isConnected])

  useEffect(() => {
    if (!refreshEvery || refreshEvery <= 0) return
    if (isConnected) return
    const id = setInterval(fetchInsight, refreshEvery * 1000)
    return () => clearInterval(id)
  }, [refreshEvery, fetchInsight, isConnected])

  if (loadingStatus) {
    return (
      <div style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: '12px', padding: compact ? '14px' : '18px',
      }}>
        <div style={{ fontSize: '12px', color: '#8b949e' }}>Checking AI status…</div>
      </div>
    )
  }

  if (!isConfigured && !loading) {
    return (
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid rgba(99,102,241,0.25)',
        borderRadius: '12px', padding: compact ? '14px' : '18px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{ fontSize: '16px' }}>🤖</span>
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#e6edf3' }}>AI Safety Insight</span>
          <span style={{
            padding: '2px 7px', background: 'rgba(99,102,241,0.2)',
            border: '1px solid rgba(99,102,241,0.4)',
            borderRadius: '10px', fontSize: '10px', color: '#818cf8', fontWeight: '700',
          }}>AI</span>
        </div>
        <p style={{ fontSize: '12px', color: '#8b949e', lineHeight: 1.6, marginBottom: '10px' }}>
          Add your Groq API key to <code style={{ color: '#6366f1' }}>backend/.env</code> to enable AI-powered safety insights.
        </p>
        <a
          href="https://console.groq.com"
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'inline-block', fontSize: '12px', color: '#818cf8',
            padding: '5px 12px', background: 'rgba(99,102,241,0.1)',
            border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: '6px', textDecoration: 'none',
          }}
        >
          Get Free Groq API Key →
        </a>
      </div>
    )
  }

  const displayInsight = aiInsight

  return (
    <div>
      <AIInsightPanel insight={displayInsight} loading={loading} compact={compact} />
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: '6px', padding: '0 2px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isConnected && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '10px', color: '#22c55e',
            }}>
              <span style={{
                width: '5px', height: '5px', borderRadius: '50%',
                background: '#22c55e',
                animation: 'pulse 1.5s infinite',
              }} />
              Real-time
            </span>
          )}
          {lastFetched && !isConnected && (
            <span style={{ fontSize: '10px', color: '#8b949e' }}>
              Updated {lastFetched.toLocaleTimeString()}
            </span>
          )}
        </div>
        <button
          onClick={fetchInsight}
          disabled={loading}
          style={{
            marginLeft: 'auto',
            background: 'none', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '11px', color: '#6366f1', padding: '2px 6px',
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? '⏳ Generating…' : '↻ Refresh'}
        </button>
      </div>
    </div>
  )
}