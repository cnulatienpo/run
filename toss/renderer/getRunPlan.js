export async function getRunPlan(targetMinutes = 60) {
  const MANIFEST_URL =
    "https://s3.us-east-005.backblazeb2.com/RunnyVisionSourceVideos/runnyvision/atoms/manifest_v1.json";

  const manifest = await fetch(MANIFEST_URL).then(r => r.json());

  const atoms = [];
  const ATOM_DURATION = manifest.chunk_seconds;

  for (const [video, data] of Object.entries(manifest.videos)) {
    for (let i = 0; i < data.atom_count; i++) {
      atoms.push({
        video,
        atomIndex: i,
        duration: ATOM_DURATION,
        url:
          `https://s3.us-east-005.backblazeb2.com/RunnyVisionSourceVideos/` +
          `runnyvision/atoms/${video}/chunk_${String(i).padStart(4,"0")}_v1.json`
      });
    }
  }

  // shuffle for variation
  atoms.sort(() => Math.random() - 0.5);

  const targetSeconds = targetMinutes * 60;
  const plan = [];
  let total = 0;

  while (total < targetSeconds) {
    const base = atoms[Math.floor(Math.random() * atoms.length)];

    // stretch logic
    const stretch = 0.6 + Math.random() * 1.8; // 0.6x–2.4x
    const effectiveDuration = base.duration * stretch;

    plan.push({
      ...base,
      stretch,
      effectiveDuration
    });

    total += effectiveDuration;
  }

  return plan;
}
