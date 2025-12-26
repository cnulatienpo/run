/**
 * AudioFileLoader.ts
 * Handles file input for audio files (.mp3, .wav, .ogg, .m4a)
 * Reads files as ArrayBuffer for decoding
 */

export interface AudioFileMetadata {
  name: string;
  size: number;
  type: string;
  duration?: number;
}

export class AudioFileLoader {
  /**
   * Load an audio file from a File input element
   * @param file - File object from <input type="file">
   * @returns Promise resolving to ArrayBuffer
   */
  async loadFile(file: File): Promise<{ buffer: ArrayBuffer; metadata: AudioFileMetadata }> {
    if (!this.isValidAudioFile(file)) {
      throw new Error(`Invalid audio file type: ${file.type}. Supported: .mp3, .wav, .ogg, .m4a`);
    }

    const buffer = await this.readFileAsArrayBuffer(file);
    const metadata: AudioFileMetadata = {
      name: file.name,
      size: file.size,
      type: file.type,
    };

    return { buffer, metadata };
  }

  /**
   * Validate file type
   */
  private isValidAudioFile(file: File): boolean {
    const validTypes = [
      'audio/mpeg',       // .mp3
      'audio/mp3',
      'audio/wav',        // .wav
      'audio/wave',
      'audio/x-wav',
      'audio/ogg',        // .ogg
      'audio/x-m4a',      // .m4a
      'audio/mp4',
    ];

    const validExtensions = ['.mp3', '.wav', '.ogg', '.m4a'];

    // Check MIME type
    if (validTypes.includes(file.type)) {
      return true;
    }

    // Fallback: check file extension
    const fileName = file.name.toLowerCase();
    return validExtensions.some(ext => fileName.endsWith(ext));
  }

  /**
   * Read file as ArrayBuffer
   */
  private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to read file as ArrayBuffer'));
        }
      };

      reader.onerror = () => {
        reject(new Error(`File read error: ${reader.error?.message || 'Unknown error'}`));
      };

      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Create a file input element and trigger file selection
   * Returns the selected file or null if cancelled
   */
  static async selectFile(): Promise<File | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/mpeg,audio/wav,audio/ogg,audio/x-m4a,audio/mp4,.mp3,.wav,.ogg,.m4a';
      
      input.onchange = () => {
        const file = input.files?.[0] || null;
        resolve(file);
      };

      input.oncancel = () => {
        resolve(null);
      };

      input.click();
    });
  }
}
