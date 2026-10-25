/**
 * Pure Neural Speech & Audio Engine for AI Interview Studio.
 * - Exclusively streams human-grade Neural TTS (Microsoft Edge Neural Voices) via FastAPI /api/interview/tts.
 * - Zero robotic browser speech synthesis fallback; eliminates duplicate/overlapping voices.
 * - Strict single-audio concurrency: aborts in-flight network requests and halts prior audio immediately.
 * - Transient MediaRecorder capture with real-time audio volume analyser & track release.
 */

import { api } from "./api";

export interface NeuralVoice {
  id: string;
  name: string;
  gender: string;
  style: string;
  tag: string;
}

export const FALLBACK_NEURAL_VOICES: NeuralVoice[] = [
  { id: "en-US-EmmaNeural", name: "Emma (US)", gender: "Female", style: "Natural, Clear & Engaging", tag: "Recommended" },
  { id: "en-US-ChristopherNeural", name: "Christopher (US)", gender: "Male", style: "Professional & Confident", tag: "Male Lead" },
  { id: "en-US-JennyNeural", name: "Jenny (US)", gender: "Female", style: "Natural, Warm & Engaging", tag: "Popular" },
  { id: "en-US-GuyNeural", name: "Guy (US)", gender: "Male", style: "Tech Lead / Conversational", tag: "Casual Tech" },
  { id: "en-US-AriaNeural", name: "Aria (US)", gender: "Female", style: "Executive Recruiter", tag: "Executive" },
  { id: "en-GB-SoniaNeural", name: "Sonia (UK)", gender: "Female", style: "British Professional", tag: "UK Formal" },
  { id: "en-GB-RyanNeural", name: "Ryan (UK)", gender: "Male", style: "Senior Systems Engineer", tag: "UK Tech" },
  { id: "en-IN-NeerjaNeural", name: "Neerja (India)", gender: "Female", style: "Indian English Professional", tag: "Global Talent" },
];

export interface SpeechSettings {
  neuralVoiceId?: string;
  speed?: number;
}

class NeuralVoiceEngine {
  private currentAudio: HTMLAudioElement | null = null;
  private currentObjectUrl: string | null = null;
  private currentAbortController: AbortController | null = null;
  private currentPlayId: number = 0;
  private isSpeaking: boolean = false;
  private neuralVoices: NeuralVoice[] = FALLBACK_NEURAL_VOICES;
  private listeners: (() => void)[] = [];

  constructor() {
    this.initVoices();
  }

  private async initVoices() {
    try {
      const remote = await api.getTTSVoices();
      if (remote && remote.length > 0) {
        this.neuralVoices = remote;
        this.notifyListeners();
      }
    } catch {
      // Use fallback defaults
    }
  }

  onVoicesLoaded(callback: () => void) {
    this.listeners.push(callback);
    callback();
  }

  private notifyListeners() {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
  }

  getNeuralVoices(): NeuralVoice[] {
    return this.neuralVoices;
  }

  /**
   * Unlock HTML5 Audio playback on user interaction (e.g. clicking 'Start Interview').
   * Prevents browsers (Chrome, Safari, iOS) from blocking automated TTS question speech.
   */
  unlockAudio(): void {
    if (typeof window === "undefined") return;
    try {
      // Play a tiny silent wav or unlock AudioContext
      const silentAudio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA");
      silentAudio.volume = 0.01;
      silentAudio.play().then(() => {
        silentAudio.pause();
        silentAudio.removeAttribute("src");
      }).catch(() => {});
    } catch {}
  }

  /**
   * Primary Speak method: Synthesizes realistic authentic neural voice.
   * Cancels prior audio & network requests immediately to guarantee a single voice.
   */
  async speak(
    text: string,
    settings: SpeechSettings = {},
    onEnd?: () => void,
    onError?: (err: any) => void
  ): Promise<void> {
    this.stop();

    const cleanText = text.replace(/[*#_`]/g, " ").trim();
    if (!cleanText) {
      if (onEnd) onEnd();
      return;
    }

    const playId = ++this.currentPlayId;
    const abortController = new AbortController();
    this.currentAbortController = abortController;
    this.isSpeaking = true;

    try {
      const diff = settings.speed ? Math.round((settings.speed - 1) * 100) : 0;
      const speedRate = diff >= 0 ? `+${diff}%` : `${diff}%`;
      const voiceId = settings.neuralVoiceId || "en-US-ChristopherNeural";

      const blob = await api.synthesizeSpeech(cleanText, voiceId, speedRate, abortController.signal);

      // If another speech was triggered or stop() was called during fetch, discard
      if (this.currentPlayId !== playId) {
        return;
      }

      if (this.currentObjectUrl) {
        URL.revokeObjectURL(this.currentObjectUrl);
        this.currentObjectUrl = null;
      }

      const url = URL.createObjectURL(blob);
      this.currentObjectUrl = url;

      const audio = new Audio(url);
      if (settings.speed) {
        audio.playbackRate = Math.max(0.75, Math.min(1.5, settings.speed));
      }

      this.currentAudio = audio;

      audio.onended = () => {
        if (this.currentPlayId === playId) {
          this.cleanupAudio();
          if (onEnd) onEnd();
        }
      };

      audio.onerror = (e) => {
        if (this.currentPlayId === playId) {
          this.cleanupAudio();
          if (onError) onError(e);
          else if (onEnd) onEnd();
        }
      };

      try {
        await audio.play();
      } catch (playErr: any) {
        if (playErr?.name === "NotAllowedError") {
          console.warn("[NeuralVoiceEngine] Autoplay blocked by browser policy. User gesture required.");
          // Inform caller that autoplay was blocked so UI can show a gentle prompt/indicator
          if (onError) onError(new Error("AUTOPLAY_BLOCKED"));
          return;
        }
        throw playErr;
      }
    } catch (err: any) {
      // If aborted or superseded, exit cleanly
      if (this.currentPlayId !== playId || err?.name === "AbortError") {
        return;
      }
      this.cleanupAudio();
      if (onError) onError(err);
      else if (onEnd) onEnd();
    }
  }

  stop() {
    this.currentPlayId++;
    if (this.currentAbortController) {
      try {
        this.currentAbortController.abort();
      } catch {}
      this.currentAbortController = null;
    }
    this.cleanupAudio();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    this.isSpeaking = false;
  }

  private cleanupAudio() {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.onended = null;
        this.currentAudio.onerror = null;
        this.currentAudio.removeAttribute("src");
        this.currentAudio.load();
      } catch {}
      this.currentAudio = null;
    }
    if (this.currentObjectUrl) {
      try {
        URL.revokeObjectURL(this.currentObjectUrl);
      } catch {}
      this.currentObjectUrl = null;
    }
    this.isSpeaking = false;
  }

  speaking(): boolean {
    return this.isSpeaking;
  }
}

export const speechSynth = new NeuralVoiceEngine();

/**
 * Transient MediaRecorder with live audio loudness analysis.
 * Zero audio persistence. Guaranteed microphone track release on stop.
 */
export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animFrameId: number | null = null;

  async start(onVolume?: (vol: number) => void): Promise<void> {
    this.audioChunks = [];
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Microphone access is not supported by your browser.");
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    // Real-time audio volume analysis for live candidate visualizer
    if (onVolume && typeof window !== "undefined") {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          this.audioCtx = new AudioContextClass();
          const source = this.audioCtx.createMediaStreamSource(this.stream);
          this.analyser = this.audioCtx.createAnalyser();
          this.analyser.fftSize = 64;
          source.connect(this.analyser);

          const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
          const update = () => {
            if (!this.analyser) return;
            this.analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            // Normalize volume (0 to 100)
            const normalized = Math.min(100, Math.round((avg / 128) * 100));
            onVolume(normalized);
            this.animFrameId = requestAnimationFrame(update);
          };
          update();
        }
      } catch {}
    }

    const options: MediaRecorderOptions = {};
    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
      options.mimeType = "audio/webm;codecs=opus";
    } else if (MediaRecorder.isTypeSupported("audio/webm")) {
      options.mimeType = "audio/webm";
    } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
      options.mimeType = "audio/ogg;codecs=opus";
    }

    this.mediaRecorder = new MediaRecorder(this.stream, options);

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.start(250);
  }

  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      this.cleanupAnalyser();
      if (!this.mediaRecorder) {
        this.releaseStream();
        reject(new Error("Recorder not active."));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const mimeType = this.mediaRecorder?.mimeType || "audio/webm";
        const audioBlob = new Blob(this.audioChunks, { type: mimeType });
        this.audioChunks = [];
        this.releaseStream();
        resolve(audioBlob);
      };

      this.mediaRecorder.stop();
    });
  }

  cancel() {
    this.cleanupAnalyser();
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
    this.audioChunks = [];
    this.releaseStream();
  }

  private cleanupAnalyser() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.audioCtx && this.audioCtx.state !== "closed") {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    this.analyser = null;
  }

  private releaseStream() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
  }
}
