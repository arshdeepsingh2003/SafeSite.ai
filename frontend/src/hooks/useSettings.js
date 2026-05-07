import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'

export function useSettings() {
  const [settings, setSettings] = useState({})
  const [systemInfo, setSystemInfo] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [users, setUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    try {
      const [settingsRes, systemRes] = await Promise.all([
        api.get('/settings'),
        api.get('/settings/system-info'),
      ])
      setSettings(settingsRes.data || {})
      setSystemInfo(systemRes.data || {})
    } catch (err) {
      console.error('Failed to load settings:', err)
      setSettings({})
      setSystemInfo({})
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true)
    try {
      const res = await api.get('/users')
      setUsers(res.data.users || [])
    } catch (err) {
      console.error('Failed to load users:', err)
      setUsers([])
    } finally {
      setLoadingUsers(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
    fetchUsers()
  }, [fetchSettings, fetchUsers])

  const updateField = useCallback((key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }, [])

  const saveAll = useCallback(async () => {
    setSaving(true)
    try {
      await api.put('/settings', settings)
      toast.success('Settings saved successfully')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }, [settings])

  const createUser = useCallback(async (userData) => {
    try {
      await api.post('/users', userData)
      toast.success(`User ${userData.name} created`)
      fetchUsers()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create user')
    }
  }, [fetchUsers])

  const deleteUser = useCallback(async (userId, userName) => {
    if (!window.confirm(`Delete user "${userName}"?`)) return
    try {
      await api.delete(`/users/${userId}`)
      toast.success('User deleted')
      fetchUsers()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete user')
    }
  }, [fetchUsers])

  const toggleUser = useCallback(async (userId) => {
    try {
      await api.patch(`/users/${userId}/toggle`)
      fetchUsers()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to toggle user')
    }
  }, [fetchUsers])

  const triggerBackup = useCallback(async () => {
    try {
      await api.post('/settings/backup')
      toast.success('Backup started')
      fetchSettings()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to start backup')
    }
  }, [fetchSettings])

  return {
    settings,
    systemInfo,
    loading,
    saving,
    updateField,
    saveAll,
    users,
    loadingUsers,
    createUser,
    deleteUser,
    toggleUser,
    triggerBackup,
  }
}
