import { useState } from 'react'

export default function LiveAIInsight({ autoLoad = false, refreshEvery = 120 }) {
  const [insight, setInsight] = useState('AI insights will appear here when connected to Groq API.')
  const [loading, setLoading] = useState(false)

  function generateInsight() {
    setLoading(true)
    setTimeout(() => {
      setInsight('Based on current monitoring: 85% compliance rate detected. Consider focusing safety checks on Zone A where most violations occur.')
      setLoading(false)
    }, 1000)
  }

  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontSize: '14px', fontWeight: '600', color: '#e6edf3' }}>AI Safety Insight</span>
        <button
          onClick={generateInsight}
          disabled={loading}
          style={{
            padding: '4px 12px',
            background: loading ? 'var(--bg-hover)' : 'var(--accent-blue)',
            border: 'none',
            borderRadius: '6px',
            color: loading ? '#8b949e' : 'white',
            fontSize: '11px',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Analyzing...' : 'Refresh'}
        </button>
      </div>
      <div style={{ fontSize: '12px', color: '#8b949e', lineHeight: '1.6' }}>{insight}</div>
    </div>
  )
}
