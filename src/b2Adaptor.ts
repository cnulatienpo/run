/**
 * B2 Storage Adapter
 * 
 * Intentionally disabled. All B2 operations return mock data.
 * When B2 is needed, implement real logic here without touching
 * server routes or business logic.
 */

export interface B2Config {
  keyId?: string;
  applicationKey?: string;
  bucketName?: string;
}

export class B2Adapter {
  constructor(private config: B2Config) {}

  async listClips(): Promise<any[]> {
    console.warn('[B2] Adapter disabled - returning empty list');
    return [];
  }

  async getManifest(videoId: string): Promise<any> {
    console.warn('[B2] Adapter disabled - returning mock manifest');
    return {
      video_id: videoId,
      chunks: [],
      total_duration: 0,
    };
  }

  async uploadFile(path: string, data: Buffer): Promise<string> {
    console.warn('[B2] Adapter disabled - skipping upload');
    return 'mock-file-id';
  }
}

// Singleton for convenience
export const b2 = new B2Adapter({
  keyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APP_KEY,
  bucketName: process.env.B2_BUCKET,
});