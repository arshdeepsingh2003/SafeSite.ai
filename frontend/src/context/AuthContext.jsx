// This file manages "who is logged in" across the whole app.
// Any component can call useAuth() to get the current user.

import { createContext, useContext, useState, useEffect } from 'react'
import api from '../services/api'

const AuthContext = createContext(null)

//wraps the entire app so all components can access auth
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)       
  const [token, setToken] = useState(null)   
  const [loading, setLoading] = useState(true) // Are we checking if logged in?

  // On app load — check if a token is saved in localStorage,(so users stay logged in after page refresh)
  useEffect(() => {
    const savedToken = localStorage.getItem('safesite_token')
    const savedUser = localStorage.getItem('safesite_user')

    if (savedToken && savedUser) {
      setToken(savedToken)
      setUser(JSON.parse(savedUser))
      // Set the token in axios so all API calls include it automatically
      api.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`
    }

    setLoading(false)
  }, [])

  // Login function 
  const login = async (email, password) => {
    const response = await api.post('/auth/login', { email, password })
    const { access_token, user: userData } = response.data

    // Save to state
    setToken(access_token)
    setUser(userData)

    // Save to localStorage (persists across page refreshes)
    localStorage.setItem('safesite_token', access_token)
    localStorage.setItem('safesite_user', JSON.stringify(userData))

    // Set in axios headers for all future requests
    api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`

    return userData
  }

  // Logout function 
  const logout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('safesite_token')
    localStorage.removeItem('safesite_user')
    delete api.defaults.headers.common['Authorization']
  }

  // Register function 
  const register = async (name, email, password, role = 'user') => {
    const response = await api.post('/auth/register', { name, email, password, role })
    const { access_token, user: userData } = response.data

    setToken(access_token)
    setUser(userData)
    localStorage.setItem('safesite_token', access_token)
    localStorage.setItem('safesite_user', JSON.stringify(userData))
    api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`

    return userData
  }

  // What we expose to all child components
  const value = {
    user,
    token,
    loading,
    login,
    logout,
    register,
    isAdmin: user?.role === 'admin',
    isLoggedIn: !!user,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>')
  }
  return context
}