# Clip Library API usage examples

These snippets show how the RV React UI can talk to the new clip ingestion and selection endpoints.

## Ingest clips from a dashboard panel

```ts
async function ingestClips(urls: string[]) {
  const payload = {
    clips: urls.map((url) => ({
      sourceType: url.includes("youtube") ? "YOUTUBE" : "LOCAL",
      urlOrPath: url,
      tags: [],
    })),
  };

  const res = await fetch("/api/clips/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to ingest clips");
  return (await res.json()) as ClipMetadata[];
}
```

## Run fake enrichment after ingestion

```ts
async function enrichLibrary() {
  const res = await fetch("/api/clips/enrich", { method: "POST" });
  if (!res.ok) throw new Error("Failed to enrich library");
  return (await res.json()) as ClipMetadata[];
}
```

## Request clips for an active run

```ts
async function loadRunPlaylist(settings: ExperienceSettings) {
  const res = await fetch("/api/clips/select", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ experienceSettings: settings }),
  });
  if (!res.ok) throw new Error("No clips available");
  return (await res.json()) as SelectedClip[];
}
```

These are intentionally simple so the real UI can adapt them for Redux/React Query later.
