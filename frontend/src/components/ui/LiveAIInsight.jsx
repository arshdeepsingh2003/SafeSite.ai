// ============================================================
// SafeSite AI — LiveAIInsight  (Phase 9)
// File: frontend/src/components/ui/LiveAIInsight.jsx
//
// A self-contained widget that:
//   1. Fetches analytics summary with current filters from /analytics/summary
//   2. Sends it to Groq via /llm/analyze
//   3. Renders the insight using <AIInsightPanel>
//
// Used on: Dashboard (compact), LiveMonitoringPage (full)
//
// Props:
//   compact      — boolean, smaller card layout
//   autoLoad     — boolean, fetch on mount (default true)
//   refreshEvery — seconds between auto-refresh (0 = off)
//   range        — analytics range filter (today/week/month/3months)
//   zone         — zone filter (all/Zone A/Zone B/etc)
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import { useLLM }       from '../../hooks/useLLM'
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
  const [insight, setInsight]   = useState(null)
  const [loading, setLoading]   = useState(false)
  const [lastFetched, setLastFetched] = useState(null)

  const fetchInsight = useCallback(async () => {
    setLoading(true)
    try {
      // 1. Get analytics summary with filters
      const summaryRes = await api.get(`/analytics/summary?range=${range}&zone=${zone}`)
      const s = summaryRes.data

      // 2. Build the payload for Groq
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

      // 3. Ask Groq for insight
      const result = await analyzeDetections(payload)
      setInsight(result)
      setLastFetched(new Date())
    } catch (err) {
      console.error('Could not load AI insight:', err)
    } finally {
      setLoading(false)
    }
  }, [analyzeDetections, range, zone])

  // Auto-load on mount and when filters change
  useEffect(() => {
    if (autoLoad && !loadingStatus) fetchInsight()
  }, [autoLoad, loadingStatus, fetchInsight])

  // Auto-refresh interval
  useEffect(() => {
    if (!refreshEvery || refreshEvery <= 0) return
    const id = setInterval(fetchInsight, refreshEvery * 1000)
    return () => clearInterval(id)
  }, [refreshEvery, fetchInsight])

  // While checking Groq status
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

  // Groq not configured
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

  return (
    <div>
      <AIInsightPanel insight={insight} loading={loading} compact={compact} />
      {/* Refresh button + last fetched time */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: '6px', padding: '0 2px',
      }}>
        {lastFetched && (
          <span style={{ fontSize: '10px', color: '#8b949e' }}>
            Updated {lastFetched.toLocaleTimeString()}
          </span>
        )}
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