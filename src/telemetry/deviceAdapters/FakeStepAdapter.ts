import { DeviceAdapter, RawTelemetrySample, TelemetryListener } from "./DeviceAdapter";

interface FakeStepAdapterOptions {
  emitIntervalMs?: number;
  minHeartRate?: number;
  maxHeartRate?: number;
  stepIncrementRange?: [number, number];
}

/**
 * Emits plausible heart-rate and step data at a regular cadence so the
 * telemetry pipeline can be exercised without a real wearable.
 */
export class FakeStepAdapter implements DeviceAdapter {
  private listeners = new Set<TelemetryListener>();
  private intervalId?: ReturnType<typeof setInterval>;
  private readonly options: Required<FakeStepAdapterOptions>;
  private currentHeartRate: number;
  private steps = 0;

  constructor(options: FakeStepAdapterOptions = {}) {
    this.options = {
      emitIntervalMs: options.emitIntervalMs ?? 1000,
      minHeartRate: options.minHeartRate ?? 110,
      maxHeartRate: options.maxHeartRate ?? 165,
      stepIncrementRange: options.stepIncrementRange ?? [2, 5],
    };
    this.currentHeartRate = this.randomHeartRate();
  }

  getName(): string {
    return "fake-step-adapter";
  }

  async start(): Promise<void> {
    if (this.intervalId) {
      return;
    }
    console.info(`[FakeStepAdapter] starting (emit every ${this.options.emitIntervalMs}ms)`);
    this.steps = 0;
    this.currentHeartRate = this.randomHeartRate();
    this.intervalId = setInterval(() => this.emitSample(), this.options.emitIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    console.info("[FakeStepAdapter] stopped");
  }

  subscribe(listener: TelemetryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emitSample() {
    this.jitterHeartRate();
    const [minSteps, maxSteps] = this.options.stepIncrementRange;
    const deltaSteps = Math.floor(Math.random() * (maxSteps - minSteps + 1)) + minSteps;
    this.steps += deltaSteps;
    const sample: RawTelemetrySample = {
      timestamp: Date.now(),
      heartRate: Math.round(this.currentHeartRate),
      steps: this.steps,
    };
    for (const listener of this.listeners) {
      listener(sample);
    }
  }

  private jitterHeartRate() {
    const drift = (Math.random() - 0.5) * 6; // +/-3 bpm swings
    this.currentHeartRate = Math.min(
      this.options.maxHeartRate,
      Math.max(this.options.minHeartRate, this.currentHeartRate + drift)
    );
  }

  private randomHeartRate(): number {
    const { minHeartRate, maxHeartRate } = this.options;
    return minHeartRate + Math.random() * (maxHeartRate - minHeartRate);
  }
}
