import { Profile } from './schema.js';

export class RVAudioEngine {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private hush = false;
  private videoElement: HTMLMediaElement | null = null;

  ensureContext() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.gain = this.ctx.createGain();
    this.gain.connect(this.ctx.destination);
  }

  attachVideo(element: HTMLMediaElement) {
    this.videoElement = element;
  }

  setHush(state: boolean) {
    this.hush = state;
    if (this.gain) {
      this.gain.gain.value = state ? 0 : 1;
    }
  }

  async playEarcon() {
    if (this.hush) return;
    this.ensureContext();
    if (!this.ctx || !this.gain) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 1800;
    const env = this.ctx.createGain();
    env.gain.value = 0;
    env.connect(this.gain);
    osc.connect(env);
    const now = this.ctx.currentTime;
    env.gain.linearRampToValueAtTime(0.8, now + 0.02);
    env.gain.linearRampToValueAtTime(0, now + 0.3);
    osc.start();
    osc.stop(now + 0.35);
  }

  playWhisper(text: string, profile: Profile) {
    if (this.hush || profile.audioPrefs.mode === 'silent') return;
    const utter = new SpeechSynthesisUtterance(text.slice(0, 40));
    utter.rate = 0.9;
    utter.volume = 0.8;
    utter.pitch = 1.1;
    if (this.videoElement && !this.videoElement.paused) {
      const originalVolume = this.videoElement.volume;
      this.videoElement.volume = Math.max(0, originalVolume - 0.4);
      utter.onend = () => {
        this.videoElement!.volume = originalVolume;
      };
    }
    speechSynthesis.speak(utter);
  }
}
