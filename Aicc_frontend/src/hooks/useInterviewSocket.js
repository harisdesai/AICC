import { useRef, useCallback, useEffect } from "react";

// Dynamically resolve WebSocket endpoint based on environment or protocol
const WS_URL = import.meta.env.VITE_WS_URL || (import.meta.env.DEV
  ? "ws://localhost:5000/ws"
  : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`);

/**
 * Custom React hook managing browser WebSocket lifecycle.
 * Handles automatic heartbeats, binary base64 conversions, and reconnection policies.
 * 
 * @param {Object} options
 * @param {Function} options.onMessage - Callback invoked when a message is received from the server
 * @param {string} options.token - JWT authentication credential token
 */
export function useInterviewSocket({ onMessage, token }) {
  const ws = useRef(null);
  const reconnectTimer = useRef(null);
  const pingInterval = useRef(null);

  /**
   * Initializes a WebSocket client and hooks event handlers for status management.
   */
  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;
    const socket = new WebSocket(WS_URL);
    socket.binaryType = "arraybuffer";

    socket.onopen = () => {
      console.log("[WS] Connected");
      // Authenticate with server upon opening the socket channel
      socket.send(JSON.stringify({ type: "auth", token }));
      
      // Ping the server periodically to prevent intermediate proxies from dropping connection
      pingInterval.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "ping" }));
        }
      }, 25000);
    };

    socket.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        onMessage(msg);
      } catch (err) {
        console.error("[WS] Parse error:", err);
      }
    };

    socket.onclose = (e) => {
      clearInterval(pingInterval.current);
      // If closing unexpectedly (i.e. network drop), attempt to reconnect after a 3-second delay
      if (!e.wasClean) {
        console.warn("[WS] Disconnected, reconnecting in 3s...");
        reconnectTimer.current = setTimeout(connect, 3000);
      }
    };

    socket.onerror = (err) => console.error("[WS] Error:", err);
    ws.current = socket;
  }, [token, onMessage]);

  /**
   * Sends a structured JSON payload to the active socket server.
   * 
   * @param {string} type - Message type/event identifier
   * @param {Object} [payload] - Optional metadata payload attributes
   */
  const send = useCallback((type, payload = {}) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type, ...payload }));
    }
  }, []);

  /**
   * Encodes a PCM binary audio ArrayBuffer into a base64 string
   * and uploads it to the active websocket connection.
   * 
   * @param {ArrayBuffer} arrayBuffer - PCM audio buffer to encode and send
   */
  const sendAudio = useCallback((arrayBuffer) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      let binary = '';
      const bytes = new Uint8Array(arrayBuffer);
      const len = bytes.byteLength;
      
      // Convert raw bytes to binary string characters
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      
      // Base64 encode and dispatch chunk JSON payload
      ws.current.send(JSON.stringify({ type: "audio_chunk", data: btoa(binary) }));
    }
  }, []);

  /**
   * Disables keepalive heartbeats, clears reconnection timers, and closes connection.
   */
  const disconnect = useCallback(() => {
    clearTimeout(reconnectTimer.current);
    clearInterval(pingInterval.current);
    ws.current?.close(1000, "Session ended");
  }, []);

  // Ensure timers are garbage collected when the hook context is destroyed
  useEffect(() => () => {
    clearTimeout(reconnectTimer.current);
    clearInterval(pingInterval.current);
  }, []);

  return { connect, send, sendAudio, disconnect };
}
