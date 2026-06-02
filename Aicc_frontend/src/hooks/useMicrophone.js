import { useRef, useState, useCallback } from "react";

// Standard frequency expected by AssemblyAI voice transcriber (16kHz mono)
const SAMPLE_RATE = 16000;

/**
 * Hook for capturing audio from microphone, resynthesizing sampling frequency,
 * and converting raw AudioContext buffers into 16-bit PCM binaries.
 * 
 * @param {Object} options
 * @param {Function} options.onAudioChunk - Callback triggered on each recorded chunk with PCM ArrayBuffer
 * @param {MediaStream|null} [options.mediaStream] - Shared camera/mic media stream if already opened by the browser
 */
export function useMicrophone({ onAudioChunk, mediaStream = null }) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState(null);
  
  // Refs to maintain reference to instances across renders
  const streamRef = useRef(null);
  const contextRef = useRef(null);
  const processorRef = useRef(null);
  const ownsStreamRef = useRef(false);

  /**
   * Initializes browser microphone media devices, AudioContext,
   * script processor node, and starts recording loop.
   */
  const start = useCallback(async () => {
    try {
      let stream = mediaStream;
      ownsStreamRef.current = false;
      
      // Request mic permission if no pre-existing browser stream is provided
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: SAMPLE_RATE,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        ownsStreamRef.current = true;
      }
      streamRef.current = stream;

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        setError("No audio track in shared stream");
        return;
      }

      // Initialize Web Audio Context at 16kHz
      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      contextRef.current = ctx;

      // Resume context if suspended by browser security/interactivity constraints
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const source = ctx.createMediaStreamSource(stream);
      const bufferSize = 4096;
      // ScriptProcessor is used here for real-time PCM downmixing and buffering
      const processor = ctx.createScriptProcessor(bufferSize, 1, 1);

      processor.onaudioprocess = (e) => {
        // Extract mono channel Float32 representation
        const inputData = e.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(inputData.length);
        
        // Convert floating point amplitudes (-1.0 to 1.0) to 16-bit signed PCM integers
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        // Dispatch raw ArrayBuffer to upstream parent callback (WebSocket)
        onAudioChunk(int16.buffer);
      };

      source.connect(processor);
      processor.connect(ctx.destination);
      processorRef.current = processor;
      
      setActive(true);
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error("[Mic] Failed to start:", err);
    }
  }, [onAudioChunk, mediaStream]);

  /**
   * Releases hardware channels, closes AudioContext, and destroys stream tracks.
   */
  const stop = useCallback(() => {
    processorRef.current?.disconnect();
    contextRef.current?.close();
    
    // Stop recording tracks only if this hook instance owns the stream lifecycle
    if (ownsStreamRef.current) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    }
    streamRef.current = null;
    ownsStreamRef.current = false;
    setActive(false);
  }, []);

  /**
   * Utility method to start or stop mic capture loop dynamically.
   */
  const toggle = useCallback(() => {
    if (active) stop();
    else start();
  }, [active, start, stop]);

  return { active, error, start, stop, toggle };
}
