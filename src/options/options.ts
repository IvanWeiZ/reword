import { loadStoredData, saveStoredData } from '../shared/storage';
import type { StoredData, RelationshipType, Sensitivity } from '../shared/types';
import {
  renderAll,
  renderProfiles,
  renderDomains,
  renderPatterns,
  renderPersonas,
  renderLearnedPreferences,
} from './renderers';

let data: StoredData;

async function init() {
  data = await loadStoredData();
  renderAll(data);
  bindEvents();
}

function bindEvents() {
  // API key validation
  document.getElementById('validate-key')!.addEventListener('click', async () => {
    const keyInput = document.getElementById('api-key') as HTMLInputElement;
    const status = document.getElementById('key-status')!;
    const key = keyInput.value.startsWith('••') ? data.settings.geminiApiKey : keyInput.value;

    status.textContent = 'Validating...';
    status.style.color = '#aaa';

    try {
      const response = await chrome.runtime.sendMessage({ type: 'validate-api-key', apiKey: key });
      const valid = response?.valid === true;
      if (valid) {
        data.settings.geminiApiKey = key;
        await saveStoredData(data);
        status.textContent = 'Valid!';
        status.style.color = '#4caf50';
      } else {
        status.textContent = 'Invalid key';
        status.style.color = '#ef5350';
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      console.warn('[Reword] API key validation error:', detail);
      status.textContent = `Validation failed: ${detail}`;
      status.style.color = '#ef5350';
    }
  });

  // Sensitivity
  document.getElementById('sensitivity')!.addEventListener('change', async (e) => {
    data.settings.sensitivity = (e.target as HTMLSelectElement)
      .value as StoredData['settings']['sensitivity'];
    await saveStoredData(data);
  });

  // Theme (#10)
  document.getElementById('theme')!.addEventListener('change', async (e) => {
    data.settings.theme = (e.target as HTMLSelectElement).value as StoredData['settings']['theme'];
    await saveStoredData(data);
  });

  // Analyze incoming (#14)
  document.getElementById('analyze-incoming')!.addEventListener('change', async (e) => {
    data.settings.analyzeIncoming = (e.target as HTMLInputElement).checked;
    await saveStoredData(data);
  });

  // Add profile (with per-platform sensitivity #3)
  document.getElementById('add-profile')!.addEventListener('click', async () => {
    const domain = (document.getElementById('new-profile-domain') as HTMLInputElement).value.trim();
    const type = (document.getElementById('new-profile-type') as HTMLSelectElement)
      .value as RelationshipType;
    const sensitivityVal = (document.getElementById('new-profile-sensitivity') as HTMLSelectElement)
      .value as Sensitivity | '';
    let label = (document.getElementById('new-profile-label') as HTMLInputElement).value.trim();
    if (!domain || !isValidDomain(domain)) return;
    if (label.length > 50) label = label.slice(0, 50);

    data.relationshipProfiles[domain] = {
      type,
      label: label || type,
      ...(sensitivityVal ? { sensitivity: sensitivityVal } : {}),
    };
    await saveStoredData(data);
    (document.getElementById('new-profile-domain') as HTMLInputElement).value = '';
    (document.getElementById('new-profile-label') as HTMLInputElement).value = '';
    renderProfiles(data);
  });

  // Add domain
  document.getElementById('add-domain')!.addEventListener('click', async () => {
    const domain = (document.getElementById('new-domain') as HTMLInputElement).value.trim();
    if (!domain || !isValidDomain(domain) || data.settings.enabledDomains.includes(domain)) return;

    data.settings.enabledDomains.push(domain);
    await saveStoredData(data);
    (document.getElementById('new-domain') as HTMLInputElement).value = '';
    renderDomains(data);
  });

  // Add custom pattern (#9)
  document.getElementById('add-pattern')!.addEventListener('click', async () => {
    const input = document.getElementById('new-pattern') as HTMLInputElement;
    const pattern = input.value.trim();
    if (!pattern) return;

    // Validate regex
    try {
      new RegExp(pattern, 'i');
    } catch {
      input.style.borderColor = '#ef5350';
      return;
    }

    if (!data.settings.customPatterns.includes(pattern)) {
      data.settings.customPatterns.push(pattern);
      await saveStoredData(data);
    }
    input.value = '';
    input.style.borderColor = '';
    renderPatterns(data);
  });

  // Add persona (#13)
  document.getElementById('add-persona')!.addEventListener('click', async () => {
    const labelInput = document.getElementById('new-persona-label') as HTMLInputElement;
    const instrInput = document.getElementById('new-persona-instruction') as HTMLInputElement;
    const label = labelInput.value.trim();
    const instruction = instrInput.value.trim();
    if (!label || !instruction) return;

    data.settings.rewritePersonas.push({ label, instruction });
    await saveStoredData(data);
    labelInput.value = '';
    instrInput.value = '';
    renderPersonas(data);
  });

  // Export data (#12)
  document.getElementById('export-data')!.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reword-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Import data (#12)
  document.getElementById('import-data')!.addEventListener('click', () => {
    document.getElementById('import-file')!.click();
  });

  document.getElementById('import-file')!.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = JSON.parse(text) as StoredData;
      if (typeof imported.schemaVersion !== 'number' || !imported.settings) {
        throw new Error('Invalid format');
      }
      data = imported;
      await saveStoredData(data);
      renderAll(data);
    } catch (error) {
      console.warn('[Reword] Import failed:', error);
    }
  });

  // Reset learned preferences (adaptive false positive reduction)
  document.getElementById('reset-learned-preferences')!.addEventListener('click', async () => {
    data.stats.dismissedCategories = {};
    await saveStoredData(data);
    renderLearnedPreferences(data);
  });
}

function isValidDomain(domain: string): boolean {
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(
    domain,
  );
}

init();
