import { useState, useEffect, useRef } from 'react';
import {
  AudioFileLoader,
  AudioDecoder,
  AudioPlaybackEngine,
  AudioAnalysisEngine,
  TempoDetector,
  MusicEventBridge,
} from '../../../../../rv-app/src/core/music/index.js';

export default function MusicPlayer() {
  const [fileName, setFileName] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bpm, setBpm] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackEngineRef = useRef<AudioPlaybackEngine | null>(null);
  const analysisEngineRef = useRef<AudioAnalysisEngine | null>(null);
  const tempoDetectorRef = useRef<TempoDetector | null>(null);
  const musicBridgeRef = useRef<MusicEventBridge | null>(null);
  const timeUpdateIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    // Initialize audio context and engines
    audioContextRef.current = new AudioContext();
    playbackEngineRef.current = new AudioPlaybackEngine(audioContextRef.current);
    analysisEngineRef.current = new AudioAnalysisEngine(audioContextRef.current);
    tempoDetectorRef.current = new TempoDetector();

    // Connect analysis engine to playback
    const gainNode = playbackEngineRef.current.getGainNode();
    analysisEngineRef.current.connectSource(gainNode);
    analysisEngineRef.current.getOutputNode().connect(audioContextRef.current.destination);

    // Create music bridge
    musicBridgeRef.current = new MusicEventBridge(
      playbackEngineRef.current,
      analysisEngineRef.current,
      tempoDetectorRef.current
    );

    // Set up callbacks
    musicBridgeRef.current.setCallbacks({
      onBpmUpdate: (newBpm, newConfidence) => {
        setBpm(newBpm);
        setConfidence(newConfidence);
      },
    });

    // Integrate with renderer.js if available
    if (typeof window !== 'undefined' && (window as any).setupMusicBridge) {
      (window as any).setupMusicBridge(musicBridgeRef.current);
    }

    // Playback ended callback
    playbackEngineRef.current.onEnded(() => {
      setIsPlaying(false);
      if (typeof window !== 'undefined' && (window as any).setMusicActive) {
        (window as any).setMusicActive(false);
      }
    });

    return () => {
      if (timeUpdateIntervalRef.current) {
        clearInterval(timeUpdateIntervalRef.current);
      }
      if (playbackEngineRef.current) {
        playbackEngineRef.current.stop();
      }
      if (analysisEngineRef.current) {
        analysisEngineRef.current.stop();
      }
      if (musicBridgeRef.current) {
        musicBridgeRef.current.stop();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const handleFileSelect = async () => {
    try {
      setError('');
      setIsLoading(true);

      // Select file
      const file = await AudioFileLoader.selectFile();
      if (!file) {
        setIsLoading(false);
        return;
      }

      // Load and decode
      const loader = new AudioFileLoader();
      const { buffer, metadata } = await loader.loadFile(file);
      setFileName(metadata.name);

      const decoder = new AudioDecoder(audioContextRef.current!);
      const audioBuffer = await decoder.decode(buffer);

      // Load into playback engine
      playbackEngineRef.current!.loadBuffer(audioBuffer);
      setDuration(audioBuffer.duration);
      setIsLoaded(true);
      setIsLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audio file');
      setIsLoading(false);
    }
  };

  const handlePlayPause = () => {
    if (!playbackEngineRef.current || !isLoaded) return;

    if (isPlaying) {
      playbackEngineRef.current.pause();
      setIsPlaying(false);
      
      // Stop analysis
      if (musicBridgeRef.current) {
        musicBridgeRef.current.stop();
      }
      
      // Notify renderer
      if (typeof window !== 'undefined' && (window as any).setMusicActive) {
        (window as any).setMusicActive(false);
      }

      // Stop time updates
      if (timeUpdateIntervalRef.current) {
        clearInterval(timeUpdateIntervalRef.current);
        timeUpdateIntervalRef.current = null;
      }
    } else {
      playbackEngineRef.current.play();
      setIsPlaying(true);

      // Start analysis
      if (musicBridgeRef.current) {
        musicBridgeRef.current.start();
      }

      // Notify renderer
      if (typeof window !== 'undefined' && (window as any).setMusicActive) {
        (window as any).setMusicActive(true);
      }

      // Start time updates
      timeUpdateIntervalRef.current = window.setInterval(() => {
        if (playbackEngineRef.current) {
          setCurrentTime(playbackEngineRef.current.getCurrentTime());
        }
      }, 100);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (playbackEngineRef.current) {
      playbackEngineRef.current.seek(newTime);
      setCurrentTime(newTime);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="viewer-box" style={{ background: '#111827', color: '#e5e7eb' }}>
      <div className="badge">Music-Driven Animation</div>
      
      {error && (
        <div style={{ 
          margin: '8px 0', 
          padding: '8px', 
          background: '#7f1d1d', 
          borderRadius: '4px',
          fontSize: '13px' 
        }}>
          {error}
        </div>
      )}

      {!isLoaded ? (
        <div>
          <p style={{ margin: '6px 0', fontSize: '14px' }}>
            Upload a music file to sync visual effects with real-time audio analysis.
          </p>
          <button
            className="button"
            type="button"
            onClick={handleFileSelect}
            disabled={isLoading}
            style={{ width: 'fit-content', marginTop: '8px' }}
          >
            {isLoading ? 'Loading...' : 'Choose Music File'}
          </button>
          <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#9ca3af' }}>
            Supports: MP3, WAV, OGG, M4A
          </p>
        </div>
      ) : (
        <div>
          <div style={{ 
            margin: '8px 0', 
            padding: '8px', 
            background: '#1f2937', 
            borderRadius: '4px' 
          }}>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>
              {fileName}
            </div>
            <div style={{ fontSize: '12px', color: '#9ca3af' }}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>

          <input
            type="range"
            min="0"
            max={duration}
            step="0.1"
            value={currentTime}
            onChange={handleSeek}
            style={{ width: '100%', margin: '8px 0' }}
          />

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
            <button
              className="button"
              type="button"
              onClick={handlePlayPause}
              style={{ flex: 1 }}
            >
              {isPlaying ? '⏸ Pause' : '▶ Play'}
            </button>
            <button
              className="button"
              type="button"
              onClick={handleFileSelect}
              style={{ flex: 1 }}
            >
              Change File
            </button>
          </div>

          {bpm > 0 && (
            <div style={{ 
              margin: '12px 0 0 0', 
              padding: '8px', 
              background: '#1f2937', 
              borderRadius: '4px',
              fontSize: '13px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>BPM: <strong>{bpm}</strong></span>
                <span>Confidence: <strong>{Math.round(confidence * 100)}%</strong></span>
              </div>
            </div>
          )}

          {isPlaying && (
            <div style={{ 
              margin: '8px 0 0 0', 
              padding: '6px 8px', 
              background: '#065f46', 
              borderRadius: '4px',
              fontSize: '12px',
              color: '#d1fae5'
            }}>
              ✓ Music-driven mode active
            </div>
          )}
        </div>
      )}
    </div>
  );
}
