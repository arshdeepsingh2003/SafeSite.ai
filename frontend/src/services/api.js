// All API calls go through this — so the base URL is set once.
// app’s API gateway
import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// --- Response interceptor ---
// If any request returns 401 (unauthorized), redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid — clear storage and reload
      localStorage.removeItem('safesite_token')
      localStorage.removeItem('safesite_user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api