import { useRef, useState, useCallback, useEffect } from "react";

// Track global library/model load state to prevent duplicate operations across hook instances
let faceApiLoaded = false;
let faceapi = null;

/**
 * Lazy loads face-api.js npm package and fetches the tiny face detector / expression nets.
 * Weights are fetched from a public repository CDN if VITE_FACE_MODEL_URL is not set.
 * 
 * @returns {Promise<void>} Resolves when models are fully loaded into memory
 */
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

/**
 * React hook that polls video element frames to run emotion classifications.
 * 
 * @param {Object} options
 * @param {React.RefObject<HTMLVideoElement>} options.videoRef - Reference to the target DOM video component
 * @param {Function} [options.onEmotion] - Callback dispatched on each positive detection frame
 * @param {number} [options.intervalMs] - Delay between detector classifications
 */
export function useEmotionDetection({ videoRef, onEmotion, intervalMs = 500 }) {
  const [ready, setReady] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState({ dominant: "neutral", scores: {} });
  const intervalRef = useRef(null);

  // Load models on component mount
  useEffect(() => {
    loadFaceApi()
      .then(() => setReady(true))
      .catch((err) => console.error("[FaceAPI] Load failed:", err));
  }, []);

  /**
   * Starts the polling timer to extract expressions from active video streams.
   */
  const start = useCallback(() => {
    if (!ready || !videoRef.current) return;
    intervalRef.current = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.paused || video.ended) return;
      try {
        // Query face-api for single face features and corresponding emotion weights
        const detections = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
          .withFaceExpressions();
        if (!detections) return;
        const expr = detections.expressions;
        
        // Find which key-value pair contains the maximum classification confidence score
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

  /**
   * Cancels the polling timer.
   */
  const stop = useCallback(() => {
    clearInterval(intervalRef.current);
  }, []);

  // Ensure interval is cleaned up if component unmounts
  useEffect(() => () => clearInterval(intervalRef.current), []);

  return { ready, currentEmotion, start, stop };
}
