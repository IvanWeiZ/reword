import { loadStoredData, saveStoredData } from '../shared/storage';
import type { StoredData, RelationshipType } from '../shared/types';

let data: StoredData;

async function init() {
  data = await loadStoredData();
  renderAll();
  bindEvents();
}

function renderAll() {
  const keyInput = document.getElementById('api-key') as HTMLInputElement;
  if (data.settings.geminiApiKey) {
    keyInput.value = '••••••••' + data.settings.geminiApiKey.slice(-4);
  }

  const sensitivitySelect = document.getElementById('sensitivity') as HTMLSelectElement;
  sensitivitySelect.value = data.settings.sensitivity;

  renderProfiles();
  renderDomains();
  renderStats();
}

function renderProfiles() {
  const list = document.getElementById('profiles-list')!;
  list.innerHTML = Object.entries(data.relationshipProfiles)
    .map(
      ([domain, profile]) => `
      <div class="profile-item">
        <span><strong>${esc(domain)}</strong> — ${esc(profile.type)} (${esc(profile.label)})</span>
        <button data-remove-profile="${esc(domain)}">Remove</button>
      </div>
    `,
    )
    .join('');

  list.querySelectorAll<HTMLElement>('[data-remove-profile]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const domain = btn.dataset.removeProfile!;
      delete data.relationshipProfiles[domain];
      await saveStoredData(data);
      renderProfiles();
    });
  });
}

function renderDomains() {
  const list = document.getElementById('domains-list')!;
  list.innerHTML = data.settings.enabledDomains
    .map(
      (d) => `
      <div class="domain-item">
        <span>${esc(d)}</span>
        <button data-remove-domain="${esc(d)}">Remove</button>
      </div>
    `,
    )
    .join('');

  list.querySelectorAll<HTMLElement>('[data-remove-domain]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const domain = btn.dataset.removeDomain!;
      data.settings.enabledDomains = data.settings.enabledDomains.filter((d) => d !== domain);
      await saveStoredData(data);
      renderDomains();
    });
  });
}

function renderStats() {
  const stats = document.getElementById('stats')!;
  stats.innerHTML = `
    <div>Messages analyzed: ${data.stats.totalAnalyzed}</div>
    <div>Messages flagged: ${data.stats.totalFlagged}</div>
    <div>Rewrites accepted: ${data.stats.rewritesAccepted}</div>
    <div>API calls this month: ${data.stats.monthlyApiCalls}</div>
  `;
}

function bindEvents() {
  document.getElementById('validate-key')!.addEventListener('click', async () => {
    const keyInput = document.getElementById('api-key') as HTMLInputElement;
    const status = document.getElementById('key-status')!;
    const key = keyInput.value.startsWith('••') ? data.settings.geminiApiKey : keyInput.value;

    status.textContent = 'Validating...';
    status.style.color = '#aaa';

    try {
      // Delegate to service worker to avoid dynamic imports (blocked by MV3 CSP)
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
    } catch {
      status.textContent = 'Error validating';
      status.style.color = '#ef5350';
    }
  });

  document.getElementById('sensitivity')!.addEventListener('change', async (e) => {
    data.settings.sensitivity = (e.target as HTMLSelectElement)
      .value as StoredData['settings']['sensitivity'];
    await saveStoredData(data);
  });

  document.getElementById('add-profile')!.addEventListener('click', async () => {
    const domain = (document.getElementById('new-profile-domain') as HTMLInputElement).value.trim();
    const type = (document.getElementById('new-profile-type') as HTMLSelectElement)
      .value as RelationshipType;
    const label = (document.getElementById('new-profile-label') as HTMLInputElement).value.trim();
    if (!domain) return;

    data.relationshipProfiles[domain] = { type, label: label || type };
    await saveStoredData(data);
    (document.getElementById('new-profile-domain') as HTMLInputElement).value = '';
    (document.getElementById('new-profile-label') as HTMLInputElement).value = '';
    renderProfiles();
  });

  document.getElementById('add-domain')!.addEventListener('click', async () => {
    const domain = (document.getElementById('new-domain') as HTMLInputElement).value.trim();
    if (!domain || data.settings.enabledDomains.includes(domain)) return;

    data.settings.enabledDomains.push(domain);
    await saveStoredData(data);
    (document.getElementById('new-domain') as HTMLInputElement).value = '';
    renderDomains();
  });
}

function esc(text: string): string {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

init();
