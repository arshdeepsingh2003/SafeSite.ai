// ============================================================
// SafeSite AI — useSocket Hook
// File: frontend/src/hooks/useSocket.js
//
// Easy way to subscribe to Socket.IO events in any component.
//
// Usage:
//   useSocketEvent('new_alert', (data) => {
//     console.log('Got alert:', data)
//   })
//
// It automatically cleans up the listener when the component unmounts.
// ============================================================

import { useEffect } from 'react'
import { useSocket } from '../context/SocketContext'

/**
 * Subscribe to a Socket.IO event.
 * Automatically removes the listener when the component unmounts.
 *
 * @param {string}   eventName  - the socket event to listen for (e.g. 'new_alert')
 * @param {function} handler    - called with event data when the event fires
 */
export function useSocketEvent(eventName, handler) {
  const { socket } = useSocket()

  useEffect(() => {
    if (!socket || !eventName || !handler) return

    socket.on(eventName, handler)

    // Cleanup: remove this specific handler when component unmounts
    return () => {
      socket.off(eventName, handler)
    }
  }, [socket, eventName, handler])
}

export { useSocket }