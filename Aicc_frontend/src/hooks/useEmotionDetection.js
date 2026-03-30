import { useRef, useState, useCallback, useEffect } from "react";

let faceApiLoaded = false;
let faceapi = null;

async function loadFaceApi() {
  if (faceApiLoaded) return;
  const mod = await import("face-api.js");
  faceapi = mod;
  const MODEL_URL =
    import.meta.env.VITE_FACE_MODEL_URL ||
    "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights";
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
  ]);
  faceApiLoaded = true;
  console.log("[FaceAPI] Models loaded");
}

export function useEmotionDetection({ videoRef, onEmotion, intervalMs = 500 }) {
  const [ready, setReady] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState({ dominant: "neutral", scores: {} });
  const intervalRef = useRef(null);

  useEffect(() => {
    loadFaceApi()
      .then(() => setReady(true))
      .catch((err) => console.error("[FaceAPI] Load failed:", err));
  }, []);

  const start = useCallback(() => {
    if (!ready || !videoRef.current) return;
    intervalRef.current = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.paused || video.ended) return;
      try {
        const detections = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
          .withFaceExpressions();
        if (!detections) return;
        const expr = detections.expressions;
        const dominant = Object.entries(expr).sort((a, b) => b[1] - a[1])[0][0];
        const emotion = {
          dominant,
          scores: {
            happy: expr.happy || 0,
            sad: expr.sad || 0,
            angry: expr.angry || 0,
            fearful: expr.fearful || 0,
            surprised: expr.surprised || 0,
            disgusted: expr.disgusted || 0,
            neutral: expr.neutral || 0,
          },
        };
        setCurrentEmotion(emotion);
        onEmotion?.(emotion);
      } catch (_) { /* frame skip */ }
    }, intervalMs);
  }, [ready, videoRef, onEmotion, intervalMs]);

  const stop = useCallback(() => {
    clearInterval(intervalRef.current);
  }, []);

  useEffect(() => () => clearInterval(intervalRef.current), []);

  return { ready, currentEmotion, start, stop };
}
