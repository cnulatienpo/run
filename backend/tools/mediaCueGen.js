/**
 * Generates synthetic cue points for a media track based on BPM and an
 * intensity map. The goal is to offer consistent placeholders until bespoke
 * authoring tools are available.
 */

function normaliseNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function resolveIntensityMap(intensity = []) {
  if (!Array.isArray(intensity) || intensity.length === 0) {
    return [];
  }
  return intensity
    .map((value) => normaliseNumber(value))
    .filter((value) => value !== undefined)
    .map((value) => Number(value.toFixed(3)));
}

export function generateMediaCues({ bpm, length_ms: lengthMs, intensity_map: rawIntensity } = {}) {
  const intensity = resolveIntensityMap(rawIntensity);
  const safeBpm = normaliseNumber(bpm) ?? 120;
  const safeLength = normaliseNumber(lengthMs) ?? (intensity.length > 0 ? intensity.length * 4000 : 180000);
  const beatInterval = 60000 / safeBpm;
  const cueSpacing = Math.max(beatInterval * 4, 4000);

  const cues = [];
  const labels = ['jump', 'push', 'break', 'drive', 'float', 'sprint'];

  if (!intensity.length) {
    for (let t = cueSpacing; t < safeLength; t += cueSpacing) {
      const label = labels[cues.length % labels.length];
      cues.push({ t_ms: Math.round(t), cue: label });
    }
    return cues;
  }

  const segmentDuration = safeLength / intensity.length;
  intensity.forEach((value, index) => {
    const start = Math.round(index * segmentDuration);
    const cueTime = Math.round(start + cueSpacing / 2);
    let cueLabel;
    if (value >= 0.9) {
      cueLabel = 'sprint';
    } else if (value >= 0.75) {
      cueLabel = 'push';
    } else if (value >= 0.55) {
      cueLabel = 'jump';
    } else if (value >= 0.35) {
      cueLabel = 'groove';
    } else {
      cueLabel = 'breathe';
    }
    cues.push({
      t_ms: cueTime,
      cue: cueLabel,
    });
  });

  return cues;
}

export default generateMediaCues;
