import { Deck, Item, Mnemonic, Plan, Profile, SessionLog } from '../core/schema.js';
import { listDecks, listMnemonics, listProfiles, listSessions, putDeck, putMnemonic, putProfile, putPlan, putSession, clearAll, clearMediaCache, requestPersistence, getUsage } from '../core/storage.js';
import { parseCSV, parseJSON, readFile } from '../core/ingest.js';
import { buildProfile, InterviewAnswer } from '../core/profile.js';
import { createMnemonic } from '../core/mnemonic.js';
import { renderThumbnail } from '../core/collage.js';
import { buildPlan } from '../core/schedule.js';
import { startSession, SessionState } from '../core/session.js';
import { RVAudioEngine } from '../core/audio.js';
import { savePack, loadPack } from '../core/export.js';

export class RVController extends EventTarget {
  decks: Deck[] = [];
  profile: Profile | null = null;
  mnemonics: Mnemonic[] = [];
  plan: Plan | null = null;
  session: SessionState | null = null;
  sessions: SessionLog[] = [];
  audio = new RVAudioEngine();

  constructor() {
    super();
    this.bootstrap();
  }

  private async bootstrap() {
    this.decks = await listDecks();
    const profiles = await listProfiles();
    this.profile = profiles[0] ?? null;
    this.mnemonics = await listMnemonics();
    this.sessions = await listSessions();
    this.dispatchEvent(new Event('update'));
  }

  async seedFixtures() {
    const response = await fetch('../rv-app/fixtures/french_basics.json');
    const text = await response.text();
    const [deck] = parseJSON(text);
    await putDeck(deck);
    this.decks.push(deck);
    this.dispatchEvent(new Event('update'));
  }

  async ingestFile(file: File) {
    const text = await readFile(file);
    if (file.name.endsWith('.csv')) {
      const deck = parseCSV(text, file.name);
      await putDeck(deck);
      this.decks.push(deck);
    } else {
      const decks = parseJSON(text);
      for (const deck of decks) {
        await putDeck(deck);
        this.decks.push(deck);
      }
    }
    this.dispatchEvent(new Event('update'));
  }

  async saveProfile(answer: InterviewAnswer) {
    const profile = buildProfile(answer);
    await putProfile(profile);
    this.profile = profile;
    this.dispatchEvent(new Event('update'));
  }

  async generateMnemonics(deck: Deck) {
    if (!this.profile) return;
    const tasks = deck.items.map(async (item) => {
      const mnemonic = createMnemonic(item, this.profile!);
      mnemonic.media.thumbUrl = await renderThumbnail(mnemonic.sceneBrief);
      await putMnemonic(mnemonic);
      return mnemonic;
    });
    const generated = await Promise.all(tasks);
    this.mnemonics = [...this.mnemonics.filter((m) => !deck.items.some((i) => i.id === m.itemId)), ...generated];
    this.dispatchEvent(new Event('update'));
  }

  async preparePlan(mode: '60min' | 'custom' | 'freestyle', duration = 3600) {
    if (!this.decks.length) return;
    const items = this.decks[0].items;
    const plan = buildPlan(items, mode, duration);
    await putPlan(plan);
    this.plan = plan;
    this.dispatchEvent(new Event('update'));
  }

  startRun() {
    if (!this.plan) return;
    const deckItems = this.decks[0]?.items ?? [];
    const activeMnemonics = this.plan.schedule
      .map((entry) => this.mnemonics.find((m) => m.itemId === entry.itemId))
      .filter((m): m is Mnemonic => Boolean(m));
    this.session = startSession(this.plan, activeMnemonics);
    this.dispatchEvent(new Event('session'));
  }

  logEvent(action: SessionLog['events'][number]['action']) {
    if (!this.session) return;
    this.session.log.events.push({
      atSec: Date.now() - this.session.startedAt,
      itemId: this.session.plan.schedule[this.session.pointer].itemId,
      action,
    });
    this.session.pointer = Math.min(this.session.pointer + 1, this.session.plan.schedule.length - 1);
    this.dispatchEvent(new Event('session'));
  }

  async finishSession() {
    if (!this.session) return;
    this.session.log.endedAt = Date.now();
    await putSession(this.session.log);
    this.sessions.push(this.session.log);
    this.session = null;
    this.dispatchEvent(new Event('update'));
  }

  async exportAll(passphrase?: string) {
    await savePack(passphrase);
  }

  async importAll(file: File, passphrase?: string) {
    await loadPack(file, passphrase);
    await this.bootstrap();
  }

  async clearData() {
    await clearAll();
    await clearMediaCache();
    this.decks = [];
    this.mnemonics = [];
    this.sessions = [];
    this.profile = null;
    this.plan = null;
    this.session = null;
    this.dispatchEvent(new Event('update'));
  }

  async persistenceStatus() {
    return requestPersistence();
  }

  async usage() {
    return getUsage();
  }
}
