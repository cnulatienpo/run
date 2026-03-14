/**
 * AudioDecoder.ts
 * Decodes audio files using Web Audio API
 * Converts ArrayBuffer to AudioBuffer for playback and analysis
 */

export class AudioDecoder {
  private audioContext: AudioContext;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }

  /**
   * Decode an audio file from ArrayBuffer
   * @param arrayBuffer - Raw audio file data
   * @returns Promise resolving to decoded AudioBuffer
   */
  async decode(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    try {
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      return audioBuffer;
    } catch (error) {
      throw new Error(`Failed to decode audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get audio buffer metadata
   */
  static getBufferInfo(buffer: AudioBuffer): {
    duration: number;
    sampleRate: number;
    numberOfChannels: number;
    length: number;
  } {
    return {
      duration: buffer.duration,
      sampleRate: buffer.sampleRate,
      numberOfChannels: buffer.numberOfChannels,
      length: buffer.length,
    };
  }

  /**
   * Create a mono mixdown from multichannel audio
   * Useful for analysis that doesn't need stereo separation
   */
  static createMonoMix(buffer: AudioBuffer): Float32Array {
    const length = buffer.length;
    const channels = buffer.numberOfChannels;
    const mono = new Float32Array(length);

    if (channels === 1) {
      return buffer.getChannelData(0);
    }

    // Mix all channels equally
    for (let ch = 0; ch < channels; ch++) {
      const channelData = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        mono[i] += channelData[i] / channels;
      }
    }

    return mono;
  }
}
