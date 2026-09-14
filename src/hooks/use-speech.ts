"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Web Speech API wrappers.
 *
 * Recognition and synthesis are both vendor-prefixed, inconsistently supported,
 * and full of sharp edges (Chrome fires `end` spontaneously; iOS Safari refuses
 * to start without a user gesture; voices load asynchronously). Everything that
 * touches those APIs lives here, so components can treat speech as a plain hook
 * and degrade to typing when `supported` is false.
 *
 * Audio never leaves the device through us: recognition returns text, and that
 * text is what the pronunciation endpoint scores.
 */

// The DOM lib does not type SpeechRecognition, so declare the surface we use.
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message?: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

/** BCP-47 tags for the accents the app offers. */
export const ACCENT_LOCALE: Record<string, string> = {
  UK: "en-GB",
  US: "en-US",
  AU: "en-AU",
  CA: "en-CA",
  IE: "en-IE",
  IN: "en-IN",
  ZA: "en-ZA",
  SCO: "en-GB",
};

const ERROR_MESSAGES: Record<string, string> = {
  "no-speech": "No speech was detected. Check your microphone and try again.",
  "audio-capture": "No microphone was found.",
  "not-allowed": "Microphone access was refused. Enable it in your browser settings to use this feature.",
  "service-not-allowed": "Speech recognition is unavailable in this browser or context.",
  network: "The speech service could not be reached.",
  aborted: "",
};

export interface SpeechRecognitionState {
  supported: boolean;
  listening: boolean;
  interimTranscript: string;
  finalTranscript: string;
  error: string | null;
  /** Milliseconds of recording, used as the fluency denominator. */
  durationMs: number;
  start: (locale?: string) => void;
  stop: () => void;
  reset: () => void;
}

export function useSpeechRecognition(defaultLocale = "en-GB"): SpeechRecognitionState {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterim] = useState("");
  const [finalTranscript, setFinal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);

  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const startedAt = useRef<number>(0);
  // Chrome ends the session on a pause even with continuous=true. This flag
  // distinguishes "the user stopped" from "the engine stopped on its own".
  const stoppedByUser = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setSupported(Boolean(Ctor));
  }, []);

  const start = useCallback(
    (locale?: string) => {
      const Ctor =
        typeof window !== "undefined"
          ? window.SpeechRecognition ?? window.webkitSpeechRecognition
          : undefined;
      if (!Ctor) {
        setError("Speech recognition is not available in this browser.");
        return;
      }

      // Abandon any previous instance — reusing one after `end` is unreliable.
      recognition.current?.abort();

      const instance = new Ctor();
      instance.lang = locale ?? defaultLocale;
      instance.continuous = true;
      instance.interimResults = true;
      instance.maxAlternatives = 1;

      instance.onstart = () => {
        startedAt.current = Date.now();
        setListening(true);
        setError(null);
      };

      instance.onresult = (event) => {
        let interim = "";
        let final = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const text = result[0]?.transcript ?? "";
          if (result.isFinal) final += text;
          else interim += text;
        }
        if (interim) setInterim(interim);
        if (final) {
          setFinal((current) => `${current} ${final}`.trim());
          setInterim("");
        }
      };

      instance.onerror = (event) => {
        const message = ERROR_MESSAGES[event.error] ?? "Speech recognition failed.";
        if (message) setError(message);
        setListening(false);
      };

      instance.onend = () => {
        setDurationMs(Date.now() - startedAt.current);
        if (stoppedByUser.current) {
          setListening(false);
          stoppedByUser.current = false;
          return;
        }
        // Auto-restart after an engine-initiated stop, so a thinking pause does
        // not silently end a long answer.
        try {
          instance.start();
        } catch {
          setListening(false);
        }
      };

      stoppedByUser.current = false;
      recognition.current = instance;

      try {
        instance.start();
      } catch {
        setError("Could not start recording. Try again.");
      }
    },
    [defaultLocale],
  );

  const stop = useCallback(() => {
    stoppedByUser.current = true;
    recognition.current?.stop();
    setListening(false);
    setDurationMs(startedAt.current ? Date.now() - startedAt.current : 0);
  }, []);

  const reset = useCallback(() => {
    setFinal("");
    setInterim("");
    setError(null);
    setDurationMs(0);
  }, []);

  // Abort on unmount — a live recogniser keeps the mic indicator on.
  useEffect(() => {
    return () => {
      stoppedByUser.current = true;
      recognition.current?.abort();
    };
  }, []);

  return {
    supported,
    listening,
    interimTranscript,
    finalTranscript,
    error,
    durationMs,
    start,
    stop,
    reset,
  };
}

/* ------------------------------------------------------------------- TTS */

export interface SpeechSynthesisState {
  supported: boolean;
  speaking: boolean;
  voices: SpeechSynthesisVoice[];
  speak: (text: string, options?: { locale?: string; rate?: number; voiceURI?: string }) => void;
  cancel: () => void;
}

export function useSpeechSynthesis(): SpeechSynthesisState {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setSupported(true);

    // Voices load asynchronously in Chrome; the first call often returns [].
    const load = () => {
      const available = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
      if (available.length) setVoices(available);
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  const speak = useCallback(
    (text: string, options: { locale?: string; rate?: number; voiceURI?: string } = {}) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

      // Queued utterances pile up if the learner taps repeatedly.
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = options.locale ?? "en-GB";
      utterance.rate = options.rate ?? 1;

      const voice =
        (options.voiceURI && voices.find((v) => v.voiceURI === options.voiceURI)) ||
        voices.find((v) => v.lang === utterance.lang) ||
        voices.find((v) => v.lang.startsWith(utterance.lang.slice(0, 2)));
      if (voice) utterance.voice = voice;

      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);

      window.speechSynthesis.speak(utterance);
    },
    [voices],
  );

  const cancel = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  useEffect(() => cancel, [cancel]);

  return { supported, speaking, voices, speak, cancel };
}
