// @ts-ignore
import {
  clearRecentTags,
  configureEffectPacks,
  exportSessionLog,
  getRecentTags,
  getEffectPacks,
  recordTag,
  replaySession,
  setEffectInterval,
  setIntensityMultiplier,
  setRareChance,
  updateBPM,
} from '../../../renderer/hallucinationEngine.js';

const EFFECT_PACK_CONFIG = getEffectPacks();
const PACKS = Object.keys(EFFECT_PACK_CONFIG);
const DEFAULT_PACK = PACKS.includes('default') ? 'default' : PACKS[0];
type PackName = (typeof PACKS)[number];
const getMoodsForPack = (packName: PackName) =>
  Object.keys(EFFECT_PACK_CONFIG[packName] || {}).filter((key) => Array.isArray((EFFECT_PACK_CONFIG as any)[packName]?.[key]));
type MoodName = string;

const STORAGE_KEY = 'rv.hallucination.settings';

type PackMoodState = Record<MoodName, boolean>;

interface HallucinationSettings {
  selectedPacks: PackName[];
  packMoods: Record<PackName, PackMoodState>;
  effectInterval: number;
  rareChance: number;
  intensityMultiplier: number;
  bpm: number;
  bpmOverride: boolean;
  stepRate: number;
  replaySpeed: number;
}

const defaultMoods = (packName: PackName): PackMoodState => {
  const moods = getMoodsForPack(packName);
  return moods.reduce(
    (acc, mood) => ({
      ...acc,
      [mood]: true,
    }),
    {} as PackMoodState,
  );
};

const defaultPackMoods = (): Record<PackName, PackMoodState> =>
  PACKS.reduce(
    (acc, pack) => ({
      ...acc,
      [pack as PackName]: defaultMoods(pack as PackName),
    }),
    {} as Record<PackName, PackMoodState>,
  );

const DEFAULT_SETTINGS_BASE: HallucinationSettings = {
  selectedPacks: DEFAULT_PACK ? ([DEFAULT_PACK] as PackName[]) : [],
  packMoods: defaultPackMoods(),
  effectInterval: 4000,
  rareChance: 0.02,
  intensityMultiplier: 1,
  bpm: 100,
  bpmOverride: false,
  stepRate: 0,
  replaySpeed: 1,
};

const sanitizePackSelection = (selected: string[] | undefined): PackName[] => {
  const valid = (selected || []).filter((pack) => PACKS.includes(pack)) as PackName[];
  if (valid.length) return valid;
  return DEFAULT_PACK ? ([DEFAULT_PACK] as PackName[]) : [];
};

const sanitizePackMoods = (packMoods: Record<string, PackMoodState> = {}): Record<PackName, PackMoodState> =>
  PACKS.reduce((acc, packName) => {
    const moods = getMoodsForPack(packName as PackName);
    const existing = packMoods[packName] || {};
    acc[packName as PackName] = moods.reduce(
      (moodAcc, mood) => ({
        ...moodAcc,
        [mood]: existing[mood] !== false,
      }),
      {} as PackMoodState,
    );
    return acc;
  }, {} as Record<PackName, PackMoodState>);

const normalizeSettings = (rawSettings: Partial<HallucinationSettings>): HallucinationSettings => {
  const merged = { ...DEFAULT_SETTINGS_BASE, ...rawSettings };
  const selectedPacks = sanitizePackSelection(merged.selectedPacks as unknown as string[]);
  const packMoods = sanitizePackMoods(merged.packMoods as unknown as Record<string, PackMoodState>);
  return { ...merged, selectedPacks, packMoods };
};

function loadSettings(): HallucinationSettings {
  const defaults: HallucinationSettings = { ...DEFAULT_SETTINGS_BASE };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return normalizeSettings({ ...defaults, ...parsed });
  } catch (error) {
    console.warn('[HallucinationControls] Failed to load settings', error);
    return defaults;
  }
}

function persistSettings(settings: HallucinationSettings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('[HallucinationControls] Failed to persist settings', error);
  }
}

class RVHallucinationControls extends HTMLElement {
  settings: HallucinationSettings = loadSettings();

  connectedCallback() {
    this.className = 'panel';
    this.render();
    this.applySettingsToEngine();
  }

  private applySettingsToEngine() {
    configureEffectPacks({
      selectedPacks: this.settings.selectedPacks,
      moodFilters: this.settings.packMoods,
    });
    setEffectInterval(this.settings.effectInterval);
    setRareChance(this.settings.rareChance);
    setIntensityMultiplier(this.settings.intensityMultiplier);
    if (this.settings.bpmOverride) {
      updateBPM(this.settings.bpm);
    }
  }

  private updateSettings(partial: Partial<HallucinationSettings>) {
    // Normalize to active effect packs/moods before persisting so the UI never advertises inactive options.
    this.settings = normalizeSettings({ ...this.settings, ...partial });
    persistSettings(this.settings);
    this.applySettingsToEngine();
    this.render();
  }

  private render() {
    this.innerHTML = '';
    const heading = document.createElement('h2');
    heading.textContent = 'Hallucination Controls';

    const description = document.createElement('p');
    description.textContent = 'Tune the hallucination engine without cluttering the HUD.';

    const packsSection = this.renderPackMixer();
    const slidersSection = this.renderSliderControls();
    const bpmSection = this.renderBpmControls();
    const sessionSection = this.renderSessionControls();
    const tagSection = this.renderTagControls();

    const randomizeButton = document.createElement('button');
    randomizeButton.className = 'large-btn';
    randomizeButton.textContent = 'Randomize Everything';
    randomizeButton.addEventListener('click', () => this.randomizeAll());

    this.append(heading, description, packsSection, slidersSection, randomizeButton, bpmSection, sessionSection, tagSection);
  }

  private renderPackMixer() {
    const section = document.createElement('section');
    section.innerHTML = '<h3>Effect packs</h3>';
    const packsList = document.createElement('div');
    packsList.style.display = 'flex';
    packsList.style.flexDirection = 'column';
    packsList.style.gap = '8px';

    PACKS.forEach((packName) => {
      const card = document.createElement('div');
      card.style.border = '1px solid rgba(255,255,255,0.08)';
      card.style.borderRadius = '12px';
      card.style.padding = '8px 12px';

      const packRow = document.createElement('div');
      packRow.style.display = 'flex';
      packRow.style.alignItems = 'center';
      packRow.style.justifyContent = 'space-between';

      const packLabel = document.createElement('label');
      packLabel.style.display = 'flex';
      packLabel.style.alignItems = 'center';
      packLabel.style.gap = '8px';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = this.settings.selectedPacks.includes(packName);
      checkbox.addEventListener('change', () => {
        const next = new Set(this.settings.selectedPacks);
        if (checkbox.checked) {
          next.add(packName);
        } else {
          next.delete(packName);
        }
        if (!next.size) next.add('default');
        this.updateSettings({ selectedPacks: Array.from(next) as PackName[] });
      });

      const title = document.createElement('strong');
      title.textContent = packName.charAt(0).toUpperCase() + packName.slice(1);

      packLabel.append(checkbox, title);
      packRow.append(packLabel);
      card.append(packRow);

      const details = document.createElement('details');
      details.open = checkbox.checked;
      const summary = document.createElement('summary');
      summary.textContent = 'Moods';
      details.append(summary);

      const moodGrid = document.createElement('div');
      moodGrid.style.display = 'grid';
      moodGrid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(120px, 1fr))';
      moodGrid.style.gap = '6px';

      const packMoods = this.settings.packMoods[packName] || defaultMoods(packName as PackName);

      getMoodsForPack(packName as PackName).forEach((mood) => {
        const moodLabel = document.createElement('label');
        moodLabel.style.display = 'flex';
        moodLabel.style.alignItems = 'center';
        moodLabel.style.gap = '6px';
        const moodCheckbox = document.createElement('input');
        moodCheckbox.type = 'checkbox';
        moodCheckbox.checked = packMoods[mood];
        moodCheckbox.addEventListener('change', () => {
          const updated = {
            ...this.settings.packMoods,
            [packName]: { ...packMoods, [mood]: moodCheckbox.checked },
          } as Record<PackName, PackMoodState>;
          this.updateSettings({ packMoods: updated });
        });
        moodLabel.append(moodCheckbox, document.createTextNode(mood.charAt(0).toUpperCase() + mood.slice(1)));
        moodGrid.appendChild(moodLabel);
      });

      details.append(moodGrid);
      card.append(details);
      packsList.append(card);
    });

    section.append(packsList);
    return section;
  }

  private renderSliderControls() {
    const section = document.createElement('section');
    section.innerHTML = '<h3>Spawn & Intensity</h3>';
    const list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '12px';

    list.append(
      this.createSlider('Spawn interval (ms)', 800, 8000, 200, this.settings.effectInterval, (value) =>
        this.updateSettings({ effectInterval: value }),
      ),
      this.createSlider('Rare chance', 0, 0.25, 0.005, this.settings.rareChance, (value) =>
        this.updateSettings({ rareChance: value }),
        true,
      ),
      this.createSlider('Intensity multiplier', 0.5, 2, 0.1, this.settings.intensityMultiplier, (value) =>
        this.updateSettings({ intensityMultiplier: value }),
      ),
    );

    section.append(list);
    return section;
  }

  private renderBpmControls() {
    const section = document.createElement('section');
    section.innerHTML = '<h3>Rhythm</h3>';

    const bpmRow = document.createElement('div');
    bpmRow.style.display = 'flex';
    bpmRow.style.alignItems = 'center';
    bpmRow.style.gap = '8px';

    const bpmInput = document.createElement('input');
    bpmInput.type = 'number';
    bpmInput.min = '60';
    bpmInput.max = '190';
    bpmInput.value = String(this.settings.bpm);
    bpmInput.addEventListener('input', () => this.updateSettings({ bpm: Number(bpmInput.value) || 0 }));

    const overrideLabel = document.createElement('label');
    overrideLabel.style.display = 'flex';
    overrideLabel.style.alignItems = 'center';
    overrideLabel.style.gap = '6px';

    const overrideCheckbox = document.createElement('input');
    overrideCheckbox.type = 'checkbox';
    overrideCheckbox.checked = this.settings.bpmOverride;
    overrideCheckbox.addEventListener('change', () => this.updateSettings({ bpmOverride: overrideCheckbox.checked }));

    overrideLabel.append(overrideCheckbox, document.createTextNode('Override auto BPM detection'));

    bpmRow.append(document.createTextNode('BPM'), bpmInput, overrideLabel);

    section.append(bpmRow);
    return section;
  }

  private renderSessionControls() {
    const section = document.createElement('section');
    section.innerHTML = '<h3>Session</h3>';

    const exportBtn = document.createElement('button');
    exportBtn.className = 'large-btn';
    exportBtn.textContent = 'Export Session Log';
    exportBtn.addEventListener('click', () => exportSessionLog());

    const replaySpeed = document.createElement('input');
    replaySpeed.type = 'number';
    replaySpeed.step = '0.25';
    replaySpeed.min = '0.25';
    replaySpeed.value = String(this.settings.replaySpeed ?? 1);
    replaySpeed.addEventListener('input', () => this.updateSettings({ replaySpeed: Number(replaySpeed.value) || 1 }));

    const replaySpeedLabel = document.createElement('label');
    replaySpeedLabel.style.display = 'flex';
    replaySpeedLabel.style.flexDirection = 'column';
    replaySpeedLabel.style.gap = '6px';
    replaySpeedLabel.textContent = 'Replay speed';
    replaySpeedLabel.append(replaySpeed);

    const importLabel = document.createElement('label');
    importLabel.style.display = 'flex';
    importLabel.style.flexDirection = 'column';
    importLabel.style.gap = '6px';
    importLabel.textContent = 'Replay log (.json)';

    const importInput = document.createElement('input');
    importInput.type = 'file';
    importInput.accept = '.json,application/json';
    importInput.addEventListener('change', async () => {
      const file = importInput.files?.[0];
      if (!file) return;
      try {
        const content = await file.text();
        const data = JSON.parse(content);
        replaySession(data, this.settings.replaySpeed || 1);
      } catch (error) {
        console.warn('[HallucinationControls] Failed to replay log', error);
      }
    });

    importLabel.append(importInput);

    const stepRateRow = document.createElement('div');
    stepRateRow.style.display = 'flex';
    stepRateRow.style.alignItems = 'center';
    stepRateRow.style.gap = '8px';

    const stepRateInput = document.createElement('input');
    stepRateInput.type = 'range';
    stepRateInput.min = '0';
    stepRateInput.max = '180';
    stepRateInput.step = '1';
    stepRateInput.value = String(this.settings.stepRate ?? 0);
    stepRateInput.disabled = true;
    stepRateInput.title = 'Disabled: live cadence comes from runtime sensors.';
    const stepRateValue = document.createElement('span');
    stepRateValue.textContent = 'Live sensor driven';

    stepRateRow.append(document.createTextNode('Step rate (inactive placeholder - live sensors only)'), stepRateInput, stepRateValue);

    section.append(exportBtn, importLabel, replaySpeedLabel, stepRateRow);
    return section;
  }

  private renderTagControls() {
    const section = document.createElement('section');
    section.innerHTML = '<h3>Tags</h3>';
    const recent = document.createElement('div');
    recent.style.marginBottom = '8px';
    this.refreshTags(recent);

    const addRow = document.createElement('div');
    addRow.style.display = 'flex';
    addRow.style.gap = '8px';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Add tag';

    const addBtn = document.createElement('button');
    addBtn.textContent = 'Add';
    addBtn.addEventListener('click', () => {
      if (!input.value.trim()) return;
      recordTag(input.value.trim());
      input.value = '';
      this.refreshTags(recent);
    });

    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear tags';
    clearBtn.addEventListener('click', () => {
      clearRecentTags();
      this.refreshTags(recent);
    });

    addRow.append(input, addBtn, clearBtn);
    section.append(recent, addRow);
    return section;
  }

  private refreshTags(container: HTMLElement) {
    const tags = getRecentTags(8);
    container.textContent = tags.length ? `Recent: ${tags.join(', ')}` : 'No tags recorded yet';
  }

  private createSlider(
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
    onChange: (value: number) => void,
    asPercent = false,
  ) {
    const wrapper = document.createElement('label');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.gap = '4px';

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'center';

    const title = document.createElement('span');
    title.textContent = label;

    const valueLabel = document.createElement('strong');
    valueLabel.textContent = asPercent ? `${Math.round(value * 100)}%` : value.toFixed(2).replace(/\.00$/, '');

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener('input', () => {
      const numeric = Number(input.value);
      valueLabel.textContent = asPercent ? `${Math.round(numeric * 100)}%` : numeric.toFixed(2).replace(/\.00$/, '');
      onChange(numeric);
    });

    row.append(title, valueLabel);
    wrapper.append(row, input);
    return wrapper;
  }

  private randomizeAll() {
    const randomPackSelection = PACKS.filter(() => Math.random() > 0.4);
    const selectedPacks = sanitizePackSelection(
      (randomPackSelection.length ? randomPackSelection : this.settings.selectedPacks) as string[],
    );
    const packMoods: Record<PackName, PackMoodState> = { ...this.settings.packMoods } as Record<PackName, PackMoodState>;
    selectedPacks.forEach((pack) => {
      const moods: PackMoodState = { ...packMoods[pack] };
      getMoodsForPack(pack).forEach((mood) => {
        moods[mood] = Math.random() > 0.2;
      });
      packMoods[pack] = moods;
    });

    this.updateSettings({
      selectedPacks,
      packMoods,
      effectInterval: Math.round(800 + Math.random() * 6000),
      rareChance: Math.random() * 0.25,
      intensityMultiplier: Number((0.5 + Math.random() * 1.5).toFixed(2)),
      bpm: 80 + Math.round(Math.random() * 80),
      bpmOverride: Math.random() > 0.5,
      replaySpeed: Number((0.5 + Math.random() * 1.5).toFixed(2)),
    });
  }
}

customElements.define('rv-hallucination-controls', RVHallucinationControls);
