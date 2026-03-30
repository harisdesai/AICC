import { useRef, useState, useCallback } from "react";

const SAMPLE_RATE = 16000;

/**
 * @param {{ onAudioChunk: (buf: ArrayBuffer) => void, mediaStream?: MediaStream | null }} opts
 */
export function useMicrophone({ onAudioChunk, mediaStream = null }) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState(null);
  const streamRef = useRef(null);
  const contextRef = useRef(null);
  const processorRef = useRef(null);
  const ownsStreamRef = useRef(false);

  const start = useCallback(async () => {
    try {
      let stream = mediaStream;
      ownsStreamRef.current = false;
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

      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      contextRef.current = ctx;

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const source = ctx.createMediaStreamSource(stream);
      const bufferSize = 4096;
      const processor = ctx.createScriptProcessor(bufferSize, 1, 1);

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
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

  const stop = useCallback(() => {
    processorRef.current?.disconnect();
    contextRef.current?.close();
    if (ownsStreamRef.current) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    }
    streamRef.current = null;
    ownsStreamRef.current = false;
    setActive(false);
  }, []);

  const toggle = useCallback(() => {
    if (active) stop();
    else start();
  }, [active, start, stop]);

  return { active, error, start, stop, toggle };
}
