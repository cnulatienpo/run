export function clipToMnemonic(clip: any) {
  return {
    hookPhrase: clip.title ?? 'Untitled Scene',
    whisperText: clip.description ?? '',
    sceneBrief: { action: clip.tags?.[0] ?? 'observe' },
    media: { thumbUrl: '' },
    itemId: clip.id,
  };
}

export function mnemonicToClip(m: any) {
  return {
    title: m.hookPhrase,
    description: m.whisperText,
    tags: [m.sceneBrief.action],
    urlOrPath: '',
  };
}
