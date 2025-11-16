import { sendTelemetry } from "../api/runClient";
import type { DeviceAdapter, RawTelemetrySample } from "./deviceAdapters/DeviceAdapter";

export interface HeartRateBand {
  mode: "ABOVE" | "RANGE" | "AUTO";
  min?: number;
  max?: number;
}

export interface TelemetryManagerOptions {
  baseUrl: string;
  heartRateBand?: HeartRateBand;
  userId?: string;
  sendIntervalMs?: number;
}

export interface TelemetryState {
  currentHeartRate: number | null;
  lastSampleTimestamp: number | null;
  adapterName: string;
  inTargetZone: boolean;
  totalSteps: number;
  sessionDurationSeconds: number;
  timeInTargetZoneSeconds: number;
}

export type TelemetryStateListener = (state: TelemetryState) => void;

const createInitialState = (adapter: DeviceAdapter): TelemetryState => ({
  adapterName: adapter.getName(),
  currentHeartRate: null,
  inTargetZone: false,
  lastSampleTimestamp: null,
  totalSteps: 0,
  sessionDurationSeconds: 0,
  timeInTargetZoneSeconds: 0,
});

export class TelemetryManager {
  private readonly adapter: DeviceAdapter;
  private options: TelemetryManagerOptions;
  private lastSample?: RawTelemetrySample;
  private sendTimer?: ReturnType<typeof setInterval>;
  private adapterUnsubscribe?: () => void;
  private accumulatedDeltaSeconds = 0;
  private latestHeartRate: number | null = null;
  private latestInTargetZone?: boolean;
  private state: TelemetryState;
  private listeners = new Set<TelemetryStateListener>();
  private isSending = false;
  private running = false;

  constructor(adapter: DeviceAdapter, options: TelemetryManagerOptions) {
    this.adapter = adapter;
    this.options = { ...options, sendIntervalMs: options.sendIntervalMs ?? 2500 };
    this.state = createInitialState(adapter);
  }

  getState(): TelemetryState {
    return { ...this.state };
  }

  subscribe(listener: TelemetryStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  isRunning(): boolean {
    return this.running;
  }

  setHeartRateBand(band?: HeartRateBand) {
    this.options = { ...this.options, heartRateBand: band };
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    console.info(`[TelemetryManager] starting adapter ${this.adapter.getName()}`);
    this.resetState();
    this.running = true;
    this.adapterUnsubscribe = this.adapter.subscribe((sample) => this.handleSample(sample));
    await this.adapter.start();
    this.sendTimer = setInterval(() => {
      void this.flushPendingTelemetry();
    }, this.options.sendIntervalMs);
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }
    console.info("[TelemetryManager] stopping");
    this.running = false;
    if (this.sendTimer) {
      clearInterval(this.sendTimer);
      this.sendTimer = undefined;
    }
    if (this.adapterUnsubscribe) {
      this.adapterUnsubscribe();
      this.adapterUnsubscribe = undefined;
    }
    await this.adapter.stop();
    await this.flushPendingTelemetry(true);
  }

  private resetState() {
    this.state = createInitialState(this.adapter);
    this.lastSample = undefined;
    this.accumulatedDeltaSeconds = 0;
    this.latestHeartRate = null;
    this.latestInTargetZone = undefined;
    this.emitState();
  }

  private handleSample(sample: RawTelemetrySample) {
    const deltaSeconds = this.computeDeltaSeconds(sample);
    this.lastSample = sample;
    const heartRate = sample.heartRate ?? this.latestHeartRate;
    const inTargetZone =
      heartRate != null && heartRate !== undefined
        ? this.computeInTargetZone(heartRate)
        : this.state.inTargetZone;

    if (heartRate != null) {
      this.state.currentHeartRate = heartRate;
      this.latestHeartRate = heartRate;
    }
    if (sample.steps != null) {
      this.state.totalSteps = sample.steps;
    }
    this.state.lastSampleTimestamp = sample.timestamp;
    if (deltaSeconds > 0) {
      this.state.sessionDurationSeconds += deltaSeconds;
      if (inTargetZone) {
        this.state.timeInTargetZoneSeconds += deltaSeconds;
      }
    }
    this.state.inTargetZone = Boolean(inTargetZone);

    this.accumulatedDeltaSeconds += deltaSeconds;
    this.latestInTargetZone = inTargetZone;

    this.emitState();
  }

  private computeDeltaSeconds(sample: RawTelemetrySample): number {
    if (!this.lastSample) {
      return 0;
    }
    const deltaMs = sample.timestamp - this.lastSample.timestamp;
    if (deltaMs <= 0) {
      return 0;
    }
    return deltaMs / 1000;
  }

  private computeInTargetZone(heartRate: number): boolean {
    const band = this.options.heartRateBand;
    if (!band || band.mode === "AUTO") {
      return false;
    }
    if (band.mode === "ABOVE") {
      if (band.min == null) {
        return false;
      }
      return heartRate >= band.min;
    }
    if (band.min == null || band.max == null) {
      return false;
    }
    return heartRate >= band.min && heartRate <= band.max;
  }

  private async flushPendingTelemetry(force = false): Promise<void> {
    if (this.isSending) {
      return;
    }
    if (!force && this.accumulatedDeltaSeconds <= 0) {
      return;
    }
    if (this.accumulatedDeltaSeconds <= 0) {
      this.accumulatedDeltaSeconds = 0;
      return;
    }
    const payload = {
      heartRate: this.latestHeartRate ?? undefined,
      inTargetZone: this.latestInTargetZone,
      deltaSeconds: Number(this.accumulatedDeltaSeconds.toFixed(3)),
    };
    this.accumulatedDeltaSeconds = 0;
    this.isSending = true;
    try {
      console.info("[TelemetryManager] sending telemetry", payload);
      await sendTelemetry(this.options.baseUrl, payload, this.options.userId);
    } catch (error) {
      console.error("[TelemetryManager] Failed to send telemetry", error);
    } finally {
      this.isSending = false;
    }
  }

  private emitState() {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
