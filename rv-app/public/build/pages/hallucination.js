// @ts-ignore
import { clearRecentTags, configureEffectPacks, exportSessionLog, getRecentTags, recordTag, replaySession, setEffectInterval, setIntensityMultiplier, setRareChance, updateBPM, } from '../../../renderer/hallucinationEngine.js';
const PACKS = ['default', 'fog', 'dreamcore'];
const MOODS = ['ambient', 'rare', 'glide', 'dreamcore'];
const STORAGE_KEY = 'rv.hallucination.settings';
const defaultMoods = () => ({
    ambient: true,
    rare: true,
    glide: true,
    dreamcore: true,
});
function loadSettings() {
    const defaults = {
        selectedPacks: ['default'],
        packMoods: {
            default: defaultMoods(),
            fog: defaultMoods(),
            dreamcore: defaultMoods(),
        },
        effectInterval: 4000,
        rareChance: 0.02,
        intensityMultiplier: 1,
        bpm: 100,
        bpmOverride: false,
        stepRate: 0,
        replaySpeed: 1,
    };
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw)
            return defaults;
        const parsed = JSON.parse(raw);
        return {
            ...defaults,
            ...parsed,
            selectedPacks: (parsed.selectedPacks || defaults.selectedPacks).filter((pack) => PACKS.includes(pack)),
            packMoods: {
                ...defaults.packMoods,
                ...(parsed.packMoods || {}),
            },
        };
    }
    catch (error) {
        console.warn('[HallucinationControls] Failed to load settings', error);
        return defaults;
    }
}
function persistSettings(settings) {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
    catch (error) {
        console.warn('[HallucinationControls] Failed to persist settings', error);
    }
}
class RVHallucinationControls extends HTMLElement {
    constructor() {
        super(...arguments);
        this.settings = loadSettings();
    }
    connectedCallback() {
        this.className = 'panel';
        this.render();
        this.applySettingsToEngine();
    }
    applySettingsToEngine() {
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
    updateSettings(partial) {
        this.settings = { ...this.settings, ...partial };
        persistSettings(this.settings);
        this.applySettingsToEngine();
        this.render();
    }
    render() {
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
    renderPackMixer() {
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
                }
                else {
                    next.delete(packName);
                }
                if (!next.size)
                    next.add('default');
                this.updateSettings({ selectedPacks: Array.from(next) });
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
            const packMoods = this.settings.packMoods[packName] || defaultMoods();
            MOODS.forEach((mood) => {
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
                    };
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
    renderSliderControls() {
        const section = document.createElement('section');
        section.innerHTML = '<h3>Spawn & Intensity</h3>';
        const list = document.createElement('div');
        list.style.display = 'flex';
        list.style.flexDirection = 'column';
        list.style.gap = '12px';
        list.append(this.createSlider('Spawn interval (ms)', 800, 8000, 200, this.settings.effectInterval, (value) => this.updateSettings({ effectInterval: value })), this.createSlider('Rare chance', 0, 0.25, 0.005, this.settings.rareChance, (value) => this.updateSettings({ rareChance: value }), true), this.createSlider('Intensity multiplier', 0.5, 2, 0.1, this.settings.intensityMultiplier, (value) => this.updateSettings({ intensityMultiplier: value })));
        section.append(list);
        return section;
    }
    renderBpmControls() {
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
    renderSessionControls() {
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
            if (!file)
                return;
            try {
                const content = await file.text();
                const data = JSON.parse(content);
                replaySession(data, this.settings.replaySpeed || 1);
            }
            catch (error) {
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
        const stepRateValue = document.createElement('span');
        stepRateValue.textContent = `${this.settings.stepRate ?? 0} spm`;
        stepRateInput.addEventListener('input', () => {
            const value = Number(stepRateInput.value) || 0;
            stepRateValue.textContent = `${value} spm`;
            this.updateSettings({ stepRate: value });
        });
        stepRateRow.append(document.createTextNode('Step rate (for preview)'), stepRateInput, stepRateValue);
        section.append(exportBtn, importLabel, replaySpeedLabel, stepRateRow);
        return section;
    }
    renderTagControls() {
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
            if (!input.value.trim())
                return;
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
    refreshTags(container) {
        const tags = getRecentTags(8);
        container.textContent = tags.length ? `Recent: ${tags.join(', ')}` : 'No tags recorded yet';
    }
    createSlider(label, min, max, step, value, onChange, asPercent = false) {
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
    randomizeAll() {
        const randomPackSelection = PACKS.filter(() => Math.random() > 0.4);
        const selectedPacks = (randomPackSelection.length ? randomPackSelection : ['default']);
        const packMoods = { ...this.settings.packMoods };
        selectedPacks.forEach((pack) => {
            const moods = { ...packMoods[pack] };
            MOODS.forEach((mood) => {
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
            stepRate: Math.round(Math.random() * 160),
            replaySpeed: Number((0.5 + Math.random() * 1.5).toFixed(2)),
        });
    }
}
customElements.define('rv-hallucination-controls', RVHallucinationControls);
