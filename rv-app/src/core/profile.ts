import { MnemonicDevice, Profile } from './schema.js';

export interface InterviewAnswer {
  challenge: string;
  devices: MnemonicDevice[];
  absurdity: 'mild' | 'medium' | 'wild';
  audioMode: 'silent' | 'earcons' | 'whisper' | 'voiceover';
  talkback: 'off' | 'short' | 'long';
  city: string;
}

export function buildProfile(answer: InterviewAnswer): Profile {
  return {
    id: `profile-${crypto.randomUUID?.() ?? Date.now()}`,
    createdAt: Date.now(),
    mnemonicPrefs: {
      devices: answer.devices,
      absurdity: answer.absurdity,
      complexity: answer.challenge === 'lists' ? 4 : 3,
    },
    audioPrefs: {
      mode: answer.audioMode,
      talkback: answer.talkback,
    },
    safety: { sfw: true, motion: 'gentle' },
    cityAnchors: [answer.city],
    defaults: { runMode: '60min' },
  };
}

export const INTERVIEW_QUESTIONS = [
  'Where does your memory wobble most?',
  'Pick your favorite mnemonic devices.',
  'How weird should scenes get?',
  'How chatty should RV be?',
  'Choose a city anchor.',
];
