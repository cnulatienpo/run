export interface RawTelemetrySample {
  /** Epoch timestamp in milliseconds for when the device recorded this sample. */
  timestamp: number;
  /** Heart rate in beats per minute, if the device provides it. */
  heartRate?: number;
  /**
   * Cumulative steps recorded by the device. We treat this as the total number
   * of steps observed so far in the current session.
   */
  steps?: number;
}

export type TelemetryListener = (sample: RawTelemetrySample) => void;

export interface DeviceAdapter {
  /** Begin streaming data from the device. */
  start(): Promise<void>;
  /** Stop streaming data from the device. */
  stop(): Promise<void>;
  /**
   * Register a listener that receives raw telemetry samples. The returned
   * function should be called to unsubscribe the listener.
   */
  subscribe(listener: TelemetryListener): () => void;
  /** Identifier used for logging/debugging purposes. */
  getName(): string;
}
