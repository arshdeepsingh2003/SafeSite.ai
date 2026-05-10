// ============================================================
// SafeSite AI — useReports Hook  (Phase 12)
// File: frontend/src/hooks/useReports.js
//
// Manages all reports API calls:
//   - Fetch report list and summary stats
//   - Generate new reports
//   - Download, view, delete reports
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'

export function useReports({ typeFilter = 'all', page = 1, limit = 5 } = {}) {
  const [reports,   setReports]   = useState([])
  const [summary,   setSummary]   = useState(null)
  const [total,     setTotal]     = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [generating, setGenerating] = useState(false)

  // ── Fetch list + summary ──────────────────────────────────
  const fetchReports = useCallback(async () => {
    setLoading(true)
    try {
      const skip = (page - 1) * limit
      const [listRes, sumRes] = await Promise.all([
        api.get(`/reports?type=${typeFilter}&limit=${limit}&skip=${skip}`),
        api.get('/reports/summary'),
      ])
      setReports(listRes.data.reports || [])
      setTotal(listRes.data.total     || 0)
      setSummary(sumRes.data)
    } catch (err) {
      console.error('Failed to load reports:', err)
    } finally {
      setLoading(false)
    }
  }, [typeFilter, page, limit])

  useEffect(() => { fetchReports() }, [fetchReports])

  // ── Generate a new report ─────────────────────────────────
  const generateReport = useCallback(async ({
    type     = 'daily',
    zone     = 'all',
    site     = 'all',
    dateFrom = null,
    dateTo   = null,
  } = {}) => {
    setGenerating(true)
    const toastId = toast.loading(`Generating ${type} report…`)
    try {
      const res = await api.post('/reports/generate', {
        type,
        zone,
        site,
        date_from: dateFrom,
        date_to:   dateTo,
      })
      toast.success('✅ Report generated!', { id: toastId })
      await fetchReports()     // refresh list
      return res.data.report   // return the full report object
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to generate report'
      toast.error(msg, { id: toastId })
      return null
    } finally {
      setGenerating(false)
    }
  }, [fetchReports])

  // ── Get full report content ───────────────────────────────
  const getReport = useCallback(async (reportId) => {
    try {
      const res = await api.get(`/reports/${reportId}`)
      return res.data
    } catch {
      toast.error('Could not load report')
      return null
    }
  }, [])

  // ── Download report as .txt ───────────────────────────────
  const downloadReport = useCallback(async (reportId, reportName) => {
    try {
      const res = await api.get(`/reports/${reportId}/download`, {
        responseType: 'blob',
      })
      const url  = URL.createObjectURL(new Blob([res.data]))
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${reportName?.replace(/\s+/g, '_') || 'report'}.txt`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Report downloaded!')
    } catch {
      toast.error('Could not download report')
    }
  }, [])

  // ── Delete report ─────────────────────────────────────────
  const deleteReport = useCallback(async (reportId, reportName) => {
    if (!window.confirm(`Delete "${reportName}"? This cannot be undone.`)) return
    try {
      await api.delete(`/reports/${reportId}`)
      toast.success('Report deleted')
      fetchReports()
    } catch {
      toast.error('Could not delete report')
    }
  }, [fetchReports])

  return {
    reports,
    summary,
    total,
    loading,
    generating,
    totalPages:     Math.max(1, Math.ceil(total / limit)),
    refresh:        fetchReports,
    generateReport,
    getReport,
    downloadReport,
    deleteReport,
  }
}