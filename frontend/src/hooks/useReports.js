import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'

export function useReports({ typeFilter = 'all', page = 1, limit = 5 } = {}) {
  const [reports,    setReports]    = useState([])
  const [summary,    setSummary]    = useState(null)
  const [total,      setTotal]      = useState(0)
  const [loading,    setLoading]    = useState(true)
  const [generating, setGenerating] = useState(false)

  const fetchReports = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        type: typeFilter,
        page,
        limit,
      })
      const [listRes, summaryRes] = await Promise.all([
        api.get(`/reports?${params}`),
        api.get('/reports/summary'),
      ])
      setReports(listRes.data.reports || [])
      setTotal(listRes.data.total || 0)
      setSummary(summaryRes.data || null)
    } catch (err) {
      console.error('Failed to load reports:', err)
    } finally {
      setLoading(false)
    }
  }, [typeFilter, page, limit])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  const generateReport = useCallback(async ({ type, zone, site }) => {
    setGenerating(true)
    try {
      const params = new URLSearchParams({ type, zone, site })
      const res = await api.post(`/reports/generate?${params}`)
      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} report generated`)
      fetchReports()
      return res.data
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not generate report')
      return null
    } finally {
      setGenerating(false)
    }
  }, [fetchReports])

  const getReport = useCallback(async (id) => {
    try {
      const res = await api.get(`/reports/${id}`)
      return res.data
    } catch (err) {
      toast.error('Could not load report')
      return null
    }
  }, [])

  const downloadReport = useCallback(async (id, name) => {
    try {
      const res = await api.get(`/reports/${id}/download`, { responseType: 'blob' })
      const blob = new Blob([res.data], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${name || 'report'}.txt`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Report downloaded')
    } catch (err) {
      toast.error('Could not download report')
    }
  }, [])

  const deleteReport = useCallback(async (id, name) => {
    if (!window.confirm(`Delete "${name || 'this report'}" permanently?`)) return
    try {
      await api.delete(`/reports/${id}`)
      toast.success('Report deleted')
      fetchReports()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not delete report')
    }
  }, [fetchReports])

  return {
    reports,
    summary,
    total,
    loading,
    generating,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    generateReport,
    getReport,
    downloadReport,
    deleteReport,
    refresh: fetchReports,
  }
}