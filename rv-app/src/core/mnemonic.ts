import { Item, Mnemonic, Profile } from './schema.js';

const COLORS = ['#0ff2c3', '#ffd166', '#ff66c4', '#66b3ff', '#f4f1de', '#ffc6ff'];
const ANCHORS = {
  paris: ['Eiffel', 'Seine', 'Metro'],
  london: ['Tube', 'Thames', 'Palace'],
  mexico: ['Zócalo', 'Papel Picado', 'Luchador'],
};

function seededRandom(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i);
  }
  return () => {
    h = Math.imul(48271, h) % 2147483647;
    return (h & 0x7fffffff) / 2147483647;
  };
}

export function createMnemonic(item: Item, profile: Profile): Mnemonic {
  const seed = `${item.id}-${profile.id}`;
  const rand = seededRandom(seed);
  const device = profile.mnemonicPrefs.devices[Math.floor(rand() * profile.mnemonicPrefs.devices.length)] ?? 'pun';
  const anchorPool = ANCHORS[profile.cityAnchors[0] as keyof typeof ANCHORS] ?? ['Trailhead', 'Bridge', 'Fountain'];
  const anchor = anchorPool[Math.floor(rand() * anchorPool.length)];
  const mascot = device === 'PAO' ? 'Runner ally' : device === 'loci' ? 'Guide' : 'Mascot';
  const action = buildAction(device, item, rand);
  const colors = pickColors(rand);
  const hookPhrase = buildHook(item, anchor, device);
  const whisperText = buildWhisper(item);
  return {
    id: `mn-${item.id}`,
    itemId: item.id,
    sceneBrief: {
      anchor,
      mascot,
      action,
      colors,
      absurdity: profile.mnemonicPrefs.absurdity,
      complexity: profile.mnemonicPrefs.complexity,
    },
    hookPhrase,
    whisperText,
    locked: false,
    media: {},
  };
}

function buildAction(device: string, item: Item, rand: () => number) {
  const verbs = ['juggling', 'balancing', 'painting', 'lifting', 'projecting'];
  const subject = item.front.split(' ')[0];
  if (device === 'pun') {
    return `${subject} pun balloon ${verbs[Math.floor(rand() * verbs.length)]}`;
  }
  if (device === 'metaphor') {
    return `${subject} turns into ${item.back ?? 'meaning'} machine`;
  }
  if (device === 'acrostic') {
    return `${subject} letters march in order`;
  }
  return `${subject} ${verbs[Math.floor(rand() * verbs.length)]}`;
}

function pickColors(rand: () => number) {
  const colors = new Set<string>();
  while (colors.size < 3) {
    colors.add(COLORS[Math.floor(rand() * COLORS.length)]);
  }
  return Array.from(colors);
}

function buildHook(item: Item, anchor: string, device: string) {
  const words = [anchor, device === 'pun' ? 'pun' : 'scene', item.front];
  return words.filter(Boolean).slice(0, 3).join(' ').slice(0, 32);
}

function buildWhisper(item: Item) {
  const text = `${item.front} ${item.back ?? ''}`.trim();
  return text.split(' ').slice(0, 4).join(' ');
}
