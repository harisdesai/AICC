import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Custom React Hook for Browser Native Speech-To-Text (STT) Recognition.
 * Employs Web Speech API (webkitSpeechRecognition / SpeechRecognition)
 * for real-time, low-latency client-side voice transcription.
 * 
 * @param {Object} [options]
 * @param {Function} [options.onTranscriptChange] - Callback whenever final or interim text updates
 */
export function useSpeechRecognition({ onTranscriptChange } = {}) {
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState(null);

  const recognitionRef = useRef(null);
  const shouldListenRef = useRef(false);
  const finalTranscriptRef = useRef("");
  const onTranscriptChangeRef = useRef(onTranscriptChange);

  useEffect(() => {
    onTranscriptChangeRef.current = onTranscriptChange;
  }, [onTranscriptChange]);

  // Initialize SpeechRecognition API once on mount
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      // Guard: strictly ignore any events if listening was turned off
      if (!shouldListenRef.current) return;

      let interim = "";
      let newlyFinalized = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const result = event.results[i];
        if (result.isFinal) {
          newlyFinalized += result[0].transcript + " ";
        } else {
          interim += result[0].transcript;
        }
      }

      if (newlyFinalized) {
        finalTranscriptRef.current += newlyFinalized;
        setTranscript(finalTranscriptRef.current.trim());
      }
      setInterimTranscript(interim);

      const combined = (finalTranscriptRef.current + " " + interim).trim();
      if (onTranscriptChangeRef.current && shouldListenRef.current) {
        onTranscriptChangeRef.current(combined);
      }
    };

    recognition.onerror = (e) => {
      console.warn("[STT] Recognition error:", e.error);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Microphone permission denied for speech recognition.");
        shouldListenRef.current = false;
        setListening(false);
      }
    };

    recognition.onend = () => {
      // Auto-restart if user requested continuous listening and didn't manually stop
      if (shouldListenRef.current) {
        try {
          recognition.start();
        } catch (_) {
          setListening(false);
        }
      } else {
        setListening(false);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      shouldListenRef.current = false;
      try {
        recognition.abort();
      } catch (_) {
        try { recognition.stop(); } catch (_) {}
      }
    };
  }, []);

  /**
   * Starts browser speech recognition listening loop.
   */
  const startListening = useCallback(() => {
    if (!supported || !recognitionRef.current) return;
    setError(null);
    shouldListenRef.current = true;
    try {
      recognitionRef.current.start();
      setListening(true);
    } catch (e) {
      // If already started, ignore error
      setListening(true);
    }
  }, [supported]);

  /**
   * Stops speech recognition listening loop immediately.
   */
  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (_) {
        try {
          recognitionRef.current.stop();
        } catch (_) {}
      }
    }
    setListening(false);
    setInterimTranscript("");
  }, []);

  /**
   * Clears accumulated transcript state.
   */
  const resetTranscript = useCallback(() => {
    finalTranscriptRef.current = "";
    setTranscript("");
    setInterimTranscript("");
  }, []);

  /**
   * Toggles listening on or off.
   */
  const toggleListening = useCallback(() => {
    if (listening) stopListening();
    else startListening();
  }, [listening, startListening, stopListening]);

  return {
    transcript,
    interimTranscript,
    fullTranscript: (transcript + " " + interimTranscript).trim(),
    listening,
    supported,
    error,
    startListening,
    stopListening,
    resetTranscript,
    toggleListening,
    setTranscript: (text) => {
      finalTranscriptRef.current = text;
      setTranscript(text);
    },
  };
}
