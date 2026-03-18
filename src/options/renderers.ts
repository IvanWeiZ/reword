import type { StoredData } from '../shared/types';
import { saveStoredData } from '../shared/storage';

/** HTML-escape a string to prevent XSS. */
export function esc(text: string): string {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

export function renderProfiles(data: StoredData) {
  const list = document.getElementById('profiles-list')!;
  list.innerHTML = Object.entries(data.relationshipProfiles)
    .map(
      ([domain, profile]) => `
      <div class="profile-item">
        <span><strong>${esc(domain)}</strong> — ${esc(profile.type)} (${esc(profile.label)})${profile.sensitivity ? ` [${profile.sensitivity}]` : ''}</span>
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
      renderProfiles(data);
    });
  });
}

export function renderDomains(data: StoredData) {
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
      renderDomains(data);
    });
  });
}

export function renderPatterns(data: StoredData) {
  const list = document.getElementById('patterns-list')!;
  list.innerHTML = data.settings.customPatterns
    .map(
      (p, i) => `
      <div class="pattern-item">
        <code>${esc(p)}</code>
        <button data-remove-pattern="${i}">Remove</button>
      </div>
    `,
    )
    .join('');

  list.querySelectorAll<HTMLElement>('[data-remove-pattern]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.removePattern!, 10);
      data.settings.customPatterns.splice(idx, 1);
      await saveStoredData(data);
      renderPatterns(data);
    });
  });
}

export function renderPersonas(data: StoredData) {
  const list = document.getElementById('personas-list')!;
  list.innerHTML = data.settings.rewritePersonas
    .map(
      (p, i) => `
      <div class="persona-item">
        <span><strong>${esc(p.label)}</strong>: ${esc(p.instruction)}</span>
        <button data-remove-persona="${i}">Remove</button>
      </div>
    `,
    )
    .join('');

  list.querySelectorAll<HTMLElement>('[data-remove-persona]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.removePersona!, 10);
      data.settings.rewritePersonas.splice(idx, 1);
      await saveStoredData(data);
      renderPersonas(data);
    });
  });
}

export function renderSuppressedPhrases(data: StoredData) {
  const list = document.getElementById('suppressed-list')!;
  if (data.settings.suppressedPhrases.length === 0) {
    list.innerHTML = '<p class="hint">No suppressed phrases yet.</p>';
    return;
  }
  list.innerHTML = data.settings.suppressedPhrases
    .map(
      (phrase, i) => `
      <div class="suppressed-item">
        <span>${esc(phrase)}</span>
        <button data-remove-suppressed="${i}">Remove</button>
      </div>
    `,
    )
    .join('');

  list.querySelectorAll<HTMLElement>('[data-remove-suppressed]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.removeSuppressed!, 10);
      data.settings.suppressedPhrases.splice(idx, 1);
      await saveStoredData(data);
      renderSuppressedPhrases(data);
    });
  });
}

export function renderStats(data: StoredData) {
  const stats = document.getElementById('stats')!;
  stats.innerHTML = `
    <div>Messages analyzed: ${data.stats.totalAnalyzed}</div>
    <div>Messages flagged: ${data.stats.totalFlagged}</div>
    <div>Rewrites accepted: ${data.stats.rewritesAccepted}</div>
    <div>API calls this month: ${data.stats.monthlyApiCalls}</div>
  `;
}

export function renderHistory(data: StoredData) {
  const container = document.getElementById('history')!;
  if (data.stats.recentFlags.length === 0) {
    container.innerHTML = '<p class="hint">No flagged messages yet.</p>';
    return;
  }

  container.innerHTML = data.stats.recentFlags
    .slice(0, 50)
    .map(
      (f) => `
      <div class="history-item">
        <span class="history-date">${new Date(f.date).toLocaleString()}</span>
        <span class="history-platform">${esc(f.platform)}</span>
        <span class="history-risk history-risk-${f.riskLevel}">${f.riskLevel}</span>
        <span class="history-snippet">${esc(f.textSnippet)}</span>
      </div>
    `,
    )
    .join('');
}

export function renderAll(data: StoredData) {
  const keyInput = document.getElementById('api-key') as HTMLInputElement;
  if (data.settings.geminiApiKey) {
    keyInput.value = '••••••••' + data.settings.geminiApiKey.slice(-4);
  }

  const sensitivitySelect = document.getElementById('sensitivity') as HTMLSelectElement;
  sensitivitySelect.value = data.settings.sensitivity;

  const themeSelect = document.getElementById('theme') as HTMLSelectElement;
  themeSelect.value = data.settings.theme;

  const incomingCheckbox = document.getElementById('analyze-incoming') as HTMLInputElement;
  incomingCheckbox.checked = data.settings.analyzeIncoming;

  renderProfiles(data);
  renderDomains(data);
  renderPatterns(data);
  renderPersonas(data);
  renderSuppressedPhrases(data);
  renderStats(data);
  renderHistory(data);
}
