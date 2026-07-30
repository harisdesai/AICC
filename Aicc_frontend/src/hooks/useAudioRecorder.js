import { useState, useRef, useCallback } from "react";
import api from "../lib/api";

/**
 * Custom React Hook for capturing microphone streams with MediaRecorder
 * and sending binary audio blobs to the ElevenLabs STT backend endpoint.
 */
export function useAudioRecorder() {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  /**
   * Starts capturing raw high-fidelity audio chunks from active media stream.
   * 
   * @param {MediaStream} stream - Active MediaStream instance
   */
  const startRecording = useCallback((stream) => {
    if (!stream) return;
    audioChunksRef.current = [];

    try {
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/wav";

      const mr = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mr.start(100); // collect 100ms chunks
      setRecording(true);
    } catch (err) {
      console.error("[useAudioRecorder] Failed to start recorder:", err);
    }
  }, []);

  /**
   * Stops active recorder, compiles audio blob, and uploads to POST /api/stt
   * 
   * @returns {Promise<string>} Transcribed text from ElevenLabs / Fallback STT
   */
  const stopRecording = useCallback(() => {
    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      if (!mr || mr.state === "inactive") {
        setRecording(false);
        resolve("");
        return;
      }

      mr.onstop = async () => {
        setRecording(false);
        setTranscribing(true);
        try {
          const blob = new Blob(audioChunksRef.current, { type: mr.mimeType || "audio/webm" });
          if (blob.size < 100) {
            setTranscribing(false);
            resolve("");
            return;
          }

          const fd = new FormData();
          fd.append("audio", blob, "recording.webm");

          const { data } = await api.post("/stt", fd, {
            headers: { "Content-Type": "multipart/form-data" },
          });

          setTranscribing(false);
          resolve(data.transcript || "");
        } catch (err) {
          console.error("[useAudioRecorder] STT upload error:", err);
          setTranscribing(false);
          resolve("");
        }
      };

      mr.stop();
    });
  }, []);

  return {
    recording,
    transcribing,
    startRecording,
    stopRecording,
  };
}
