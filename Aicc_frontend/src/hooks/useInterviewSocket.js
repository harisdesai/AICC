import { useRef, useCallback, useEffect } from "react";

const WS_URL = import.meta.env.DEV
  ? "ws://localhost:5000/ws"
  : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;

export function useInterviewSocket({ onMessage, token }) {
  const ws = useRef(null);
  const reconnectTimer = useRef(null);
  const pingInterval = useRef(null);

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;
    const socket = new WebSocket(WS_URL);
    socket.binaryType = "arraybuffer";

    socket.onopen = () => {
      console.log("[WS] Connected");
      socket.send(JSON.stringify({ type: "auth", token }));
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
      if (!e.wasClean) {
        console.warn("[WS] Disconnected, reconnecting in 3s...");
        reconnectTimer.current = setTimeout(connect, 3000);
      }
    };

    socket.onerror = (err) => console.error("[WS] Error:", err);
    ws.current = socket;
  }, [token, onMessage]);

  const send = useCallback((type, payload = {}) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type, ...payload }));
    }
  }, []);

  const sendAudio = useCallback((arrayBuffer) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      let binary = '';
      const bytes = new Uint8Array(arrayBuffer);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      ws.current.send(JSON.stringify({ type: "audio_chunk", data: btoa(binary) }));
    }
  }, []);

  const disconnect = useCallback(() => {
    clearTimeout(reconnectTimer.current);
    clearInterval(pingInterval.current);
    ws.current?.close(1000, "Session ended");
  }, []);

  useEffect(() => () => {
    clearTimeout(reconnectTimer.current);
    clearInterval(pingInterval.current);
  }, []);

  return { connect, send, sendAudio, disconnect };
}
