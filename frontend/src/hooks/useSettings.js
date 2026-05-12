import { useState, useEffect, useCallback } from 'react'
import api   from '../services/api'
import toast from 'react-hot-toast'

// Defaults shown while backend loads
const DEFAULTS = {
  system_name:          'SafeSite AI Monitoring System',
  timezone:             'Asia/Kolkata',
  date_format:          'DD MMM YYYY',
  time_format:          '24h',
  language:             'English',
  items_per_page:       10,
  auto_logout_mins:     30,
  sound_enabled:        true,
  show_confidence:      true,
  dark_mode:            true,
  confidence_threshold: 0.5,
  frame_sample_rate:    5,
  detection_model:      'YOLOv8n',
  enable_tracking:      true,
  min_detection_size:   50,
  alert_cooldown_secs:  60,
  high_only_email:      true,
  sound_high_only:      false,
  toast_duration_secs:  5,
  max_alerts_per_day:   500,
  email_alerts_enabled: true,
  alert_recipients:     '',
  max_video_size_mb:    2048,
  video_retention_days: 30,
  alert_retention_days: 90,
  default_zone:         'Zone A',
  zones:                ['Zone A', 'Zone B', 'Zone C', 'Zone D', 'Zone E'],
}

export function useSettings() {
  const [settings,      setSettings]      = useState(DEFAULTS)
  const [systemInfo,    setSystemInfo]    = useState(null)
  const [users,         setUsers]         = useState([])
  const [loading,       setLoading]       = useState(true)
  const [loadingUsers,  setLoadingUsers]  = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [dirty,         setDirty]         = useState(false)    // unsaved changes

  // ── Load settings + system info ──────────────────────────
  const loadSettings = useCallback(async () => {
    setLoading(true)
    try {
      const [settingsRes, sysRes] = await Promise.all([
        api.get('/settings'),
        api.get('/settings/system'),
      ])
      setSettings({ ...DEFAULTS, ...settingsRes.data })
      setSystemInfo(sysRes.data)
    } catch (err) {
      // Settings route not available — use defaults silently
      console.warn('Could not load settings from backend:', err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true)
    try {
      const res = await api.get('/settings/users')
      setUsers(res.data.users || [])
    } catch { setUsers([]) }
    finally  { setLoadingUsers(false) }
  }, [])

  useEffect(() => {
    loadSettings()
    loadUsers()
  }, [loadSettings, loadUsers])

  // ── Update a single field locally (not saved yet) ─────────
  const updateField = useCallback((key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    setDirty(true)
  }, [])

  // ── Save all settings to backend ─────────────────────────
  const saveAll = useCallback(async () => {
    setSaving(true)
    try {
      const res = await api.put('/settings', settings)
      toast.success(`✅ Settings saved! (${res.data.updated_fields?.length || 0} fields updated)`)
      setDirty(false)
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to save settings'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }, [settings])

  // ── User management ───────────────────────────────────────
  const createUser = useCallback(async (form) => {
    if (!form.name || !form.email || !form.password) {
      toast.error('Name, email, and password are required')
      return
    }
    try {
      await api.post('/settings/users', form)
      toast.success(`✅ User ${form.name} created!`)
      loadUsers()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create user')
    }
  }, [loadUsers])

  const deleteUser = useCallback(async (userId, name) => {
    if (!window.confirm(`Delete user "${name}"? This cannot be undone.`)) return
    try {
      await api.delete(`/settings/users/${userId}`)
      toast.success(`User ${name} deleted`)
      loadUsers()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not delete user')
    }
  }, [loadUsers])

  const toggleUser = useCallback(async (userId) => {
    try {
      const res = await api.put(`/settings/users/${userId}/toggle`)
      toast.success(res.data.message)
      loadUsers()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not toggle user')
    }
  }, [loadUsers])

  // ── Backup ────────────────────────────────────────────────
  const triggerBackup = useCallback(async () => {
    const toastId = toast.loading('Creating backup…')
    try {
      const res = await api.post('/settings/backup')
      toast.success(`✅ Backup created! ${res.data.counts?.alerts} alerts, ${res.data.counts?.videos} videos saved.`, { id: toastId })
      loadSettings()   // refresh system info (last_backup timestamp)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Backup failed', { id: toastId })
    }
  }, [loadSettings])

  return {
    // Data
    settings,
    systemInfo,
    users,
    dirty,
    // State
    loading,
    loadingUsers,
    saving,
    // Actions
    updateField,
    saveAll,
    reload:       loadSettings,
    createUser,
    deleteUser,
    toggleUser,
    triggerBackup,
  }
}