# Music-Driven Animation System

Complete implementation of real-time audio analysis and music-driven visual effects.

## Overview

This system provides a full pipeline from audio file upload through DSP analysis to real-time visual effect choreography:

```
Audio File → Decode → Playback → Analysis → Tempo Detection → Event Bridge → Animation
```

## Architecture

### Core Modules (`rv-app/src/core/music/`)

1. **AudioFileLoader.ts**
   - Handles file input via `<input type="file">`
   - Validates file types (.mp3, .wav, .ogg, .m4a)
   - Reads files as ArrayBuffer
   - Provides metadata extraction

2. **AudioDecoder.ts**
   - Decodes audio files using Web Audio API
   - Converts ArrayBuffer to AudioBuffer
   - Provides buffer info utilities
   - Creates mono mixdowns for analysis

3. **AudioPlaybackEngine.ts**
   - Manages AudioContext and playback
   - Controls: play, pause, stop, seek
   - Volume/gain control
   - Playback state tracking
   - Ended event callbacks

4. **AudioAnalysisEngine.ts**
   - Real-time DSP analysis using AnalyserNode
   - Computes:
     - FFT (frequency spectrum)
     - Energy bands (low, mid, high)
     - Spectral centroid (brightness)
     - Spectral flux (spectral change)
     - RMS energy
   - Detects:
     - Onsets (transients)
     - Energy rises
     - Energy drops
   - Event emitter architecture

5. **TempoDetector.ts**
   - BPM detection via autocorrelation
   - Inter-onset interval (IOI) histogram
   - Rolling beat tracking
   - Beat confidence scoring
   - Adaptive threshold adjustment
   - Beat phase calculation

6. **MusicEventBridge.ts**
   - Coordinates all music modules
   - Bridges events to hallucinationEngine
   - Manages callbacks:
     - `onBeat()` - downbeat events
     - `onOnset()` - transient detection
     - `onEnergyRise()` - energy increases
     - `onEnergyDrop()` - energy decreases
     - `onBpmUpdate()` - tempo changes

### Integration Layer

#### renderer/hallucinationEngine.js

**Added Functions:**
- `enableMusicDrivenMode(enabled)` - toggles between synthetic/real BPM
- `onBeat(beatEvent)` - triggers effects on beats
- `onOnset(onsetEvent)` - triggers effects on onsets
- `onEnergyRise(energyEvent)` - triggers energy-rise effects
- `onEnergyDrop(energyEvent)` - triggers energy-drop effects
- `isMusicDriven()` - checks if music mode is active

**Modified:**
- `spawnLoop()` now has two modes:
  - **Music-driven**: beats triggered by real audio events
  - **Synthetic**: original BPM-based timing

#### renderer/renderer.js

**Added Functions:**
- `setupMusicBridge(bridge)` - connects MusicEventBridge
- `setMusicActive(active)` - enables/disables music mode

**Integration:**
- Imports music event handlers from hallucinationEngine
- Forwards BPM updates to hallucinationEngine
- Manages fallback to synthetic BPM when music stops

### UI Components

#### MusicPlayer.tsx (React)

Located: `runnyvision/frontend/src/components/Runner/MusicPlayer.tsx`

Full-featured music player with:
- File selection dialog
- Play/pause controls
- Seek bar
- Current time / duration display
- BPM and confidence display
- Music-driven mode indicator
- Error handling
- Automatic cleanup

Used in: `runnyvision/frontend/src/pages/RunnerPage.tsx`

#### MusicController.ts (Vanilla TypeScript)

Located: `rv-app/src/core/MusicController.ts`

Standalone controller for vanilla TypeScript pages:
- Renders its own UI
- Same features as React component
- Used in: `rv-app/src/pages/run.ts`
- Self-contained with inline styles

## Usage

### React Component

```tsx
import MusicPlayer from './components/Runner/MusicPlayer';

export default function MyPage() {
  return (
    <div>
      <MusicPlayer />
    </div>
  );
}
```

### Vanilla TypeScript

```typescript
import { MusicController } from './core/MusicController';

const container = document.getElementById('music-container');
const musicController = new MusicController(container);

// Clean up when done
musicController.destroy();
```

### Direct API Usage

```typescript
import {
  AudioFileLoader,
  AudioDecoder,
  AudioPlaybackEngine,
  AudioAnalysisEngine,
  TempoDetector,
  MusicEventBridge,
} from './core/music/index';

// Initialize
const audioContext = new AudioContext();
const playbackEngine = new AudioPlaybackEngine(audioContext);
const analysisEngine = new AudioAnalysisEngine(audioContext);
const tempoDetector = new TempoDetector();

// Connect audio graph
const gainNode = playbackEngine.getGainNode();
analysisEngine.connectSource(gainNode);
analysisEngine.getOutputNode().connect(audioContext.destination);

// Create bridge
const bridge = new MusicEventBridge(
  playbackEngine,
  analysisEngine,
  tempoDetector
);

// Set callbacks
bridge.setCallbacks({
  onBeat: (event) => console.log('Beat!', event),
  onBpmUpdate: (bpm, confidence) => console.log('BPM:', bpm),
});

// Load and play music
const file = await AudioFileLoader.selectFile();
const loader = new AudioFileLoader();
const { buffer } = await loader.loadFile(file);
const decoder = new AudioDecoder(audioContext);
const audioBuffer = await decoder.decode(buffer);

playbackEngine.loadBuffer(audioBuffer);
playbackEngine.play();
bridge.start();
```

## Event Flow

```
User uploads file
  ↓
AudioFileLoader reads file → ArrayBuffer
  ↓
AudioDecoder decodes → AudioBuffer
  ↓
AudioPlaybackEngine plays audio
  ↓
AudioAnalysisEngine analyzes in real-time
  ↓ (60fps)
- Computes FFT
- Detects onsets
- Tracks energy
  ↓
TempoDetector processes onsets
  ↓
- Estimates BPM
- Tracks beats
  ↓
MusicEventBridge emits events:
  ↓
- onBeat() → hallucinationEngine.onBeat()
- onOnset() → hallucinationEngine.onOnset()
- onEnergyRise() → hallucinationEngine.onEnergyRise()
- onEnergyDrop() → hallucinationEngine.onEnergyDrop()
- onBpmUpdate() → renderer.updateEngineBPM()
  ↓
hallucinationEngine triggers visual effects
  ↓
Canvas/CSS effects appear synchronized to music
```

## Behavior

### Music Mode Active
- Real audio events trigger effects
- BPM from tempo detection
- Beats trigger on actual beat events
- Onsets trigger immediate effects
- Energy changes trigger mood shifts

### Music Mode Inactive (Fallback)
- Synthetic BPM mode (original behavior)
- Manual BPM setting
- Time-based beat grid
- No onset detection
- Static energy profile

### Auto-Fallback
When audio playback ends:
- `playbackEngine.onEnded()` fires
- Music bridge stops
- `enableMusicDrivenMode(false)` called
- System falls back to synthetic BPM
- hallucinationEngine continues running

## Supported Formats

- **MP3** (.mp3)
- **WAV** (.wav)
- **OGG** (.ogg)
- **M4A** (.m4a)

All formats are decoded via Web Audio API's `decodeAudioData()`.

## Performance

- **FFT Size**: 2048 (configurable)
- **Analysis Rate**: ~60 FPS (via requestAnimationFrame)
- **Onset Cooldown**: 100ms
- **Energy History**: 43 frames (~1 second at 60fps)
- **BPM Update**: 500ms intervals
- **Beat Tolerance**: ±20% of beat interval

## Configuration

### Onset Detection Sensitivity

```typescript
analysisEngine.setOnsetThreshold(1.5); // Default: 1.5
// Lower = more sensitive (0.5-3.0 range)
```

### Manual BPM Override

```typescript
tempoDetector.setBpm(120);
bridge.setBpm(120); // Also updates callbacks
```

### Effect Timing

In hallucinationEngine.js:
```javascript
setEffectInterval(4000); // milliseconds between effects
setRareChance(0.02);     // probability of rare effects
setIntensityMultiplier(1.0); // effect intensity scaling
```

## Files Modified

### New Files Created
- `rv-app/src/core/music/AudioFileLoader.ts`
- `rv-app/src/core/music/AudioDecoder.ts`
- `rv-app/src/core/music/AudioPlaybackEngine.ts`
- `rv-app/src/core/music/AudioAnalysisEngine.ts`
- `rv-app/src/core/music/TempoDetector.ts`
- `rv-app/src/core/music/MusicEventBridge.ts`
- `rv-app/src/core/music/index.ts`
- `rv-app/src/core/MusicController.ts`

### Modified Files
- `renderer/hallucinationEngine.js` - added music event handlers
- `renderer/renderer.js` - integrated music bridge
- `runnyvision/frontend/src/components/Runner/MusicPlayer.tsx` - full UI
- `rv-app/src/pages/run.ts` - added music controller

## Testing

### Basic Test

1. Open the app
2. Click "Choose Music File"
3. Select an audio file
4. Click "Play"
5. Observe:
   - BPM detection
   - Visual effects sync to beats
   - Onsets trigger strobe effects
   - Energy changes trigger mood effects

### Manual BPM Test

```typescript
// In console:
bridge.setBpm(140);
```

### Fallback Test

1. Play music
2. Wait for track to end
3. Observe automatic fallback to synthetic BPM
4. hallucinationEngine continues running

## Browser Compatibility

Requires:
- Web Audio API
- File API
- requestAnimationFrame
- ES6 modules

Tested on:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Limitations

1. **Client-side only** - no server-side analysis
2. **Single track** - no playlist support yet
3. **No visualization** - raw FFT data available but not rendered
4. **BPM range** - limited to 60-180 BPM
5. **Beat accuracy** - depends on music complexity

## Future Enhancements

- [ ] Waveform visualization
- [ ] FFT spectrum display
- [ ] Playlist support
- [ ] Beatgrid editor
- [ ] Manual onset marking
- [ ] Effect mapping presets
- [ ] MIDI input support
- [ ] Multi-track mixing
- [ ] Effect recording/playback
- [ ] Cloud storage integration

## Troubleshooting

### No BPM detected
- Check audio has clear beats
- Increase onset sensitivity
- Verify file format is supported

### Effects out of sync
- BPM detection may need time to converge
- Try manually setting BPM
- Check system performance

### Audio doesn't play
- Verify AudioContext is allowed (user interaction)
- Check browser console for errors
- Ensure file format is supported

### High CPU usage
- Lower FFT size in AudioAnalysisEngine
- Reduce analysis frame rate
- Disable unused features

## License

Part of the Runnyvision / default project.
