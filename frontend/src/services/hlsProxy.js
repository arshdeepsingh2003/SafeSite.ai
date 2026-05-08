const PROXY_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export function proxyHlsUrl(url) {
  return `${PROXY_BASE}/proxy/hls?url=${encodeURIComponent(url)}`
}
