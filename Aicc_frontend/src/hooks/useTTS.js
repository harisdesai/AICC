import { useState, useEffect, useRef, useCallback } from "react";

const ACCENTS = [
  { id: "en-IN", label: "🇮🇳 Indian Accent" },
  { id: "en-US", label: "🇺🇸 US Accent" },
  { id: "en-GB", label: "🇬🇧 UK Accent" },
];

/**
 * Custom React Hook for Browser Text-To-Speech (TTS) Synthesis.
 * Manages voice selection (defaulting to Indian Accent en-IN), speech state, muting, and replay logic.
 */
export function useTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [supported, setSupported] = useState(true);
  const [voices, setVoices] = useState([]);
  const [accent, setAccentState] = useState("en-IN");
  
  const selectedVoiceRef = useRef(null);
  const lastSpokenTextRef = useRef("");
  const accentRef = useRef("en-IN");

  /**
   * Selects best matching system voice for a given target language accent.
   */
  const findVoiceForAccent = (availableVoices, targetAccent) => {
    if (!availableVoices || availableVoices.length === 0) return null;

    if (targetAccent === "en-IN") {
      const indianVoice = availableVoices.find(
        (v) =>
          (v.lang && (v.lang.startsWith("en-IN") || v.lang.startsWith("en_IN") || v.lang.startsWith("hi-IN"))) ||
          /india|hindi|heera|ravi|rishi|veena|neerja|google english \(india\)/i.test(v.name)
      );
      if (indianVoice) return indianVoice;
    } else if (targetAccent === "en-US") {
      const usVoice = availableVoices.find(
        (v) => v.lang && (v.lang.startsWith("en-US") || v.lang.startsWith("en_US"))
      );
      if (usVoice) return usVoice;
    } else if (targetAccent === "en-GB") {
      const ukVoice = availableVoices.find(
        (v) => v.lang && (v.lang.startsWith("en-GB") || v.lang.startsWith("en_GB"))
      );
      if (ukVoice) return ukVoice;
    }

    // Fallback to any English voice
    return availableVoices.find((v) => v.lang && v.lang.startsWith("en")) || availableVoices[0];
  };

  // Initialize SpeechSynthesis and load available system voices
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setSupported(false);
      return;
    }

    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);
      selectedVoiceRef.current = findVoiceForAccent(availableVoices, accentRef.current);
    };

    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  /**
   * Updates current accent preference and rebinds target TTS voice.
   */
  const setAccent = useCallback((newAccent) => {
    setAccentState(newAccent);
    accentRef.current = newAccent;
    if (typeof window !== "undefined" && window.speechSynthesis) {
      const availableVoices = window.speechSynthesis.getVoices();
      selectedVoiceRef.current = findVoiceForAccent(availableVoices, newAccent);
    }
  }, []);

  /**
   * Speaks the provided string using browser Text-to-Speech API.
   * 
   * @param {string} text - Text string to read out loud
   * @param {Function} [onEndCallback] - Optional callback triggered when speech completes
   */
  const speak = useCallback(
    (text, onEndCallback) => {
      if (!supported || !text || isMuted) return;

      lastSpokenTextRef.current = text;

      // Cancel any ongoing speech utterance
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = accentRef.current || "en-IN";

      if (selectedVoiceRef.current) {
        utterance.voice = selectedVoiceRef.current;
      }

      utterance.rate = 0.98;  // Natural pacing
      utterance.pitch = 1.0;  // Standard neutral pitch
      utterance.volume = 1.0;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        if (onEndCallback) onEndCallback();
      };
      utterance.onerror = (e) => {
        console.warn("[TTS] Utterance error:", e);
        setIsSpeaking(false);
      };

      // Slight delay for stability across Chrome/Edge engines
      setTimeout(() => {
        window.speechSynthesis.speak(utterance);
      }, 50);
    },
    [supported, isMuted]
  );

  /**
   * Immediately stops any active TTS audio output.
   */
  const stop = useCallback(() => {
    if (supported) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, [supported]);

  /**
   * Replays the most recently requested speech string.
   */
  const repeatLast = useCallback(() => {
    if (lastSpokenTextRef.current) {
      speak(lastSpokenTextRef.current);
    }
  }, [speak]);

  /**
   * Toggles TTS mute setting on or off. Stops current utterance if muting.
   */
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (next && supported) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
      }
      return next;
    });
  }, [supported]);

  return {
    speak,
    stop,
    repeatLast,
    toggleMute,
    isSpeaking,
    isMuted,
    supported,
    voices,
    accent,
    setAccent,
    availableAccents: ACCENTS,
  };
}
