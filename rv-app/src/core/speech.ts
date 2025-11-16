type SpeechRecognition = any;
type SpeechRecognitionEvent = any;

export type SpeechEvent = { transcript: string; confidence: number };

type SpeechCallback = (event: SpeechEvent) => void;

export class TalkBack {
  private recognition: SpeechRecognition | null = null;
  private listener: SpeechCallback | null = null;

  constructor() {
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) return;
    this.recognition = new Recognition();
    this.recognition.lang = 'en-US';
    this.recognition.maxAlternatives = 1;
    this.recognition.interimResults = false;
    this.recognition.addEventListener('result', (event: SpeechRecognitionEvent) => {
      const result = event.results[0][0];
      this.listener?.({ transcript: result.transcript, confidence: result.confidence });
    });
  }

  onResult(cb: SpeechCallback) {
    this.listener = cb;
  }

  requestWindow(durationMs = 1500) {
    if (!this.recognition) return;
    this.recognition.start();
    setTimeout(() => this.recognition?.stop(), durationMs);
  }
}
