import type { StoredData, ProviderName } from '../shared/types';
import { saveStoredData } from '../shared/storage';
import { DISMISS_SUPPRESS_THRESHOLD } from '../shared/constants';

const PROVIDER_LABELS: Record<ProviderName, string> = {
  gemini: 'Gemini',
  claude: 'Claude',
  openai: 'OpenAI',
};

const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Auto-detect (default)' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'zh', label: 'Mandarin' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'de', label: 'German' },
  { value: 'ar', label: 'Arabic' },
  { value: 'hi', label: 'Hindi' },
];

/** HTML-escape a string to prevent XSS. */
export function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
      (record, i) => `
      <div class="suppressed-item">
        <span>${esc(record.phrase)}</span>
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

export function renderLearnedPreferences(data: StoredData) {
  const container = document.getElementById('learned-preferences')!;
  const categories = data.stats.dismissedCategories;
  const entries = Object.entries(categories);
  if (entries.length === 0) {
    container.innerHTML = '<p class="hint">No learned preferences yet.</p>';
    return;
  }
  container.innerHTML = entries
    .map(
      ([category, count]) =>
        `<div class="learned-pref-item"><span>${esc(category)}: ${count} dismiss${count === 1 ? '' : 'es'}${count >= DISMISS_SUPPRESS_THRESHOLD ? ' (threshold raised)' : ''}</span></div>`,
    )
    .join('');
}

export function renderProviderSection(
  container: HTMLElement,
  data: StoredData,
  onSave: () => void,
): void {
  const selectedProvider = data.settings.aiProvider;
  const apiKeyValue = data.settings.providerApiKeys[selectedProvider] ?? '';
  const maskedKey = apiKeyValue ? '••••••••' + apiKeyValue.slice(-4) : '';

  const providerOptions = (Object.keys(PROVIDER_LABELS) as ProviderName[])
    .map(
      (p) =>
        `<option value="${p}"${p === selectedProvider ? ' selected' : ''}>${esc(PROVIDER_LABELS[p])}</option>`,
    )
    .join('');

  const languageOptions = LANGUAGE_OPTIONS.map(
    (opt) =>
      `<option value="${esc(opt.value)}"${opt.value === data.settings.preferredLanguage ? ' selected' : ''}>${esc(opt.label)}</option>`,
  ).join('');

  container.innerHTML = `
    <div class="field">
      <label for="provider-select">AI Provider</label>
      <select id="provider-select">${providerOptions}</select>
    </div>
    <div class="field">
      <label id="api-key-label" for="provider-api-key">${esc(PROVIDER_LABELS[selectedProvider])} API Key</label>
      <input type="password" id="provider-api-key" placeholder="Enter your ${esc(PROVIDER_LABELS[selectedProvider])} API key" value="${esc(maskedKey)}">
      <button id="validate-provider-key">Validate</button>
      <span id="provider-key-status"></span>
    </div>
    <div class="field">
      <label for="language-select">Language</label>
      <select id="language-select">${languageOptions}</select>
    </div>
  `;

  const providerSelect = container.querySelector<HTMLSelectElement>('#provider-select')!;
  const apiKeyInput = container.querySelector<HTMLInputElement>('#provider-api-key')!;
  const apiKeyLabel = container.querySelector<HTMLElement>('#api-key-label')!;
  const validateBtn = container.querySelector<HTMLButtonElement>('#validate-provider-key')!;
  const keyStatus = container.querySelector<HTMLElement>('#provider-key-status')!;
  const languageSelect = container.querySelector<HTMLSelectElement>('#language-select')!;

  providerSelect.addEventListener('change', () => {
    const provider = providerSelect.value as ProviderName;
    data.settings.aiProvider = provider;
    const existingKey = data.settings.providerApiKeys[provider] ?? '';
    apiKeyInput.value = existingKey ? '••••••••' + existingKey.slice(-4) : '';
    apiKeyLabel.textContent = `${PROVIDER_LABELS[provider]} API Key`;
    apiKeyInput.placeholder = `Enter your ${PROVIDER_LABELS[provider]} API key`;
    keyStatus.textContent = '';
    onSave();
  });

  validateBtn.addEventListener('click', async () => {
    const provider = providerSelect.value as ProviderName;
    const existingKey = data.settings.providerApiKeys[provider] ?? '';
    const rawValue = apiKeyInput.value;
    const apiKey = rawValue.startsWith('••') ? existingKey : rawValue;

    keyStatus.textContent = 'Validating...';
    keyStatus.style.color = '#aaa';

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'validate-api-key',
        apiKey,
        provider,
      });
      const valid = response?.valid === true;
      if (valid) {
        data.settings.providerApiKeys[provider] = apiKey;
        await saveStoredData(data);
        keyStatus.textContent = 'Valid!';
        keyStatus.style.color = '#4caf50';
      } else {
        keyStatus.textContent = 'Invalid key';
        keyStatus.style.color = '#ef5350';
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      console.warn('[Reword] API key validation error:', detail);
      keyStatus.textContent = `Validation failed: ${detail}`;
      keyStatus.style.color = '#ef5350';
    }
  });

  languageSelect.addEventListener('change', async () => {
    data.settings.preferredLanguage = languageSelect.value;
    await saveStoredData(data);
  });
}

export function renderContactProfiles(container: HTMLElement, data: StoredData): void {
  const profiles = data.contactProfiles;
  const entries = Object.entries(profiles);

  const tableHtml =
    entries.length === 0
      ? '<p class="hint" id="contact-profiles-empty">No contact profiles yet.</p>'
      : `<table class="contact-profiles-table">
          <thead>
            <tr>
              <th>Display Name</th>
              <th>Platform ID</th>
              <th>Relationship</th>
              <th>Tone Goal</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${entries
              .map(
                ([platformId, profile]) => `
              <tr data-platform-id="${esc(platformId)}">
                <td>${esc(profile.displayName)}</td>
                <td>${esc(platformId)}</td>
                <td>${esc(profile.relationshipType)}</td>
                <td>${esc(profile.toneGoal)}</td>
                <td>
                  <button class="contact-delete-btn" data-platform-id="${esc(platformId)}">Delete</button>
                </td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>`;

  container.innerHTML = `
    <div id="contact-profiles-list">${tableHtml}</div>
    <div id="add-contact-form" style="display:none" class="add-contact-form">
      <div class="field">
        <label>Platform ID (e.g. gmail:jane@example.com)</label>
        <input type="text" id="contact-platform-id" placeholder="e.g. gmail:jane@example.com">
      </div>
      <div class="field">
        <label>Display Name</label>
        <input type="text" id="contact-display-name" placeholder="e.g. Jane">
      </div>
      <div class="field">
        <label>Relationship Type</label>
        <select id="contact-relationship">
          <option value="workplace">Workplace</option>
          <option value="romantic">Romantic</option>
          <option value="family">Family</option>
        </select>
      </div>
      <div class="field">
        <label>Sensitivity</label>
        <select id="contact-sensitivity">
          <option value="low">Low</option>
          <option value="medium" selected>Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <div class="field">
        <label>Tone Goal</label>
        <input type="text" id="contact-tone-goal" placeholder="e.g. more formal, match their energy">
      </div>
      <div class="field">
        <label>Cultural Context</label>
        <input type="text" id="contact-cultural-context" placeholder="e.g. prefers direct communication">
      </div>
      <button id="save-contact-profile">Save Contact</button>
      <button id="cancel-add-contact" class="btn-secondary">Cancel</button>
    </div>
    <button id="show-add-contact-form">Add Contact</button>
  `;

  // Wire delete buttons
  container.querySelectorAll<HTMLElement>('.contact-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const platformId = btn.dataset.platformId!;
      await chrome.runtime.sendMessage({ type: 'delete-contact-profile', platformId });
      delete data.contactProfiles[platformId];
      renderContactProfiles(container, data);
    });
  });

  // Show/hide add form
  const addForm = container.querySelector<HTMLElement>('#add-contact-form')!;
  const showFormBtn = container.querySelector<HTMLElement>('#show-add-contact-form')!;
  const cancelBtn = container.querySelector<HTMLElement>('#cancel-add-contact')!;

  showFormBtn.addEventListener('click', () => {
    addForm.style.display = 'block';
    showFormBtn.style.display = 'none';
  });

  cancelBtn.addEventListener('click', () => {
    addForm.style.display = 'none';
    showFormBtn.style.display = 'block';
  });

  // Save new contact
  container
    .querySelector<HTMLElement>('#save-contact-profile')!
    .addEventListener('click', async () => {
      const platformId = container
        .querySelector<HTMLInputElement>('#contact-platform-id')!
        .value.trim();
      const displayName = container
        .querySelector<HTMLInputElement>('#contact-display-name')!
        .value.trim();
      const relationshipType = container.querySelector<HTMLSelectElement>('#contact-relationship')!
        .value as 'romantic' | 'workplace' | 'family';
      const sensitivity = container.querySelector<HTMLSelectElement>('#contact-sensitivity')!
        .value as 'low' | 'medium' | 'high';
      const toneGoal = container
        .querySelector<HTMLInputElement>('#contact-tone-goal')!
        .value.trim();
      const culturalContext = container
        .querySelector<HTMLInputElement>('#contact-cultural-context')!
        .value.trim();

      if (!platformId) return;

      const profile = {
        displayName: displayName || platformId,
        platformId,
        relationshipType,
        sensitivity,
        toneGoal,
        culturalContext,
        createdAt: new Date().toISOString(),
      };

      await chrome.runtime.sendMessage({ type: 'save-contact-profile', profile });
      data.contactProfiles[platformId] = profile;
      renderContactProfiles(container, data);
    });
}

export function renderAll(data: StoredData) {
  const providerContainer = document.getElementById('provider-section');
  if (providerContainer) {
    renderProviderSection(providerContainer, data, () => saveStoredData(data));
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
  renderLearnedPreferences(data);
  renderStats(data);
  renderHistory(data);

  const contactContainer = document.getElementById('contact-profiles-section');
  if (contactContainer) {
    renderContactProfiles(contactContainer, data);
  }
}
