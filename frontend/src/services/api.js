// All API calls go through this — so the base URL is set once.
// app’s API gateway
import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// --- Request interceptor ---
// Automatically attach JWT token to all requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('safesite_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    // Debug: log the full URL being called
    console.log('API Request:', {
      baseURL: config.baseURL,
      url: config.url,
      fullURL: `${config.baseURL}${config.url}`,
      method: config.method
    })
    return config
  },
  (error) => Promise.reject(error)
)

// --- Response interceptor ---
// If any request returns 401 (unauthorized), redirect to login (only if not already there)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !window.location.pathname.includes('/login')) {
      // Token expired or invalid — clear storage and redirect
      localStorage.removeItem('safesite_token')
      localStorage.removeItem('safesite_user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api