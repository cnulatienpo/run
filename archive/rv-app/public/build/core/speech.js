export class TalkBack {
    constructor() {
        this.recognition = null;
        this.listener = null;
        const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Recognition)
            return;
        this.recognition = new Recognition();
        this.recognition.lang = 'en-US';
        this.recognition.maxAlternatives = 1;
        this.recognition.interimResults = false;
        this.recognition.addEventListener('result', (event) => {
            const result = event.results[0][0];
            this.listener?.({ transcript: result.transcript, confidence: result.confidence });
        });
    }
    onResult(cb) {
        this.listener = cb;
    }
    requestWindow(durationMs = 1500) {
        if (!this.recognition)
            return;
        this.recognition.start();
        setTimeout(() => this.recognition?.stop(), durationMs);
    }
}
