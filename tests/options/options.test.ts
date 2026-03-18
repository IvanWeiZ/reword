import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockChromeStorage } from '../mocks/mock-chrome-storage';
import { DEFAULT_STORED_DATA } from '../../src/shared/constants';
import type { StoredData } from '../../src/shared/types';

let mockStorage: ReturnType<typeof createMockChromeStorage>;

function setupDOM() {
  document.body.innerHTML = `
    <input id="api-key" type="password" />
    <button id="validate-key">Validate</button>
    <span id="key-status"></span>
    <select id="sensitivity">
      <option value="low">Low</option>
      <option value="medium" selected>Medium</option>
      <option value="high">High</option>
    </select>
    <select id="theme">
      <option value="auto">Auto</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
    <input type="checkbox" id="analyze-incoming" />
    <div id="profiles-list"></div>
    <input id="new-profile-domain" type="text" />
    <select id="new-profile-type">
      <option value="workplace">Workplace</option>
      <option value="romantic">Romantic</option>
      <option value="family">Family</option>
    </select>
    <select id="new-profile-sensitivity">
      <option value="">Default</option>
      <option value="low">Low</option>
      <option value="medium">Medium</option>
      <option value="high">High</option>
    </select>
    <input id="new-profile-label" type="text" />
    <button id="add-profile">Add Profile</button>
    <div id="domains-list"></div>
    <input id="new-domain" type="text" />
    <button id="add-domain">Add Domain</button>
    <div id="patterns-list"></div>
    <input id="new-pattern" type="text" />
    <button id="add-pattern">Add Pattern</button>
    <div id="personas-list"></div>
    <input id="new-persona-label" type="text" />
    <input id="new-persona-instruction" type="text" />
    <button id="add-persona">Add Persona</button>
    <div id="stats"></div>
    <div id="history"></div>
    <button id="export-data">Export</button>
    <button id="import-data">Import</button>
    <input id="import-file" type="file" accept=".json" style="display:none" />
  `;
}

function freshSetup(overrides?: Partial<StoredData>) {
  vi.resetModules();
  mockStorage = createMockChromeStorage();
  (globalThis as any).chrome = {
    storage: mockStorage,
    runtime: {
      sendMessage: vi.fn().mockResolvedValue({ valid: true }),
      onMessage: { addListener: vi.fn() },
    },
  };
  setupDOM();
  const storedData = overrides
    ? { ...structuredClone(DEFAULT_STORED_DATA), ...overrides }
    : structuredClone(DEFAULT_STORED_DATA);
  return mockStorage.local.set({ reword: storedData });
}

async function initModule() {
  await import('../../src/options/options');
  await new Promise((r) => setTimeout(r, 0));
}

async function getStoredData(): Promise<StoredData> {
  const result = (await mockStorage.local.get('reword')) as any;
  return result.reword;
}

function tick() {
  return new Promise((r) => setTimeout(r, 0));
}

beforeEach(async () => {
  await freshSetup();
});

// ── 1. API key validation ──────────────────────────────────────────

describe('API key validation flow', () => {
  it('validate button sends message and shows "Valid!" on success', async () => {
    await freshSetup();
    await initModule();

    const keyInput = document.getElementById('api-key') as HTMLInputElement;
    const status = document.getElementById('key-status')!;
    keyInput.value = 'AIzaSyTestKey123';

    document.getElementById('validate-key')!.click();
    // Status should immediately show "Validating..."
    expect(status.textContent).toBe('Validating...');

    await tick();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'validate-api-key',
      apiKey: 'AIzaSyTestKey123',
    });
    expect(status.textContent).toBe('Valid!');
    expect(status.style.color).toBe('rgb(76, 175, 80)');

    const stored = await getStoredData();
    expect(stored.settings.geminiApiKey).toBe('AIzaSyTestKey123');
  });

  it('shows "Invalid key" when validation returns valid=false', async () => {
    await freshSetup();
    (globalThis as any).chrome.runtime.sendMessage = vi.fn().mockResolvedValue({ valid: false });
    await initModule();

    const keyInput = document.getElementById('api-key') as HTMLInputElement;
    keyInput.value = 'bad-key';
    document.getElementById('validate-key')!.click();
    await tick();

    const status = document.getElementById('key-status')!;
    expect(status.textContent).toBe('Invalid key');
    expect(status.style.color).toBe('rgb(239, 83, 80)');
  });

  it('shows error message when sendMessage rejects', async () => {
    await freshSetup();
    (globalThis as any).chrome.runtime.sendMessage = vi
      .fn()
      .mockRejectedValue(new Error('Network error'));
    await initModule();

    const keyInput = document.getElementById('api-key') as HTMLInputElement;
    keyInput.value = 'some-key';
    document.getElementById('validate-key')!.click();
    await tick();

    const status = document.getElementById('key-status')!;
    expect(status.textContent).toContain('Validation failed');
    expect(status.textContent).toContain('Network error');
    expect(status.style.color).toBe('rgb(239, 83, 80)');
  });

  it('uses stored key when input shows masked value', async () => {
    await freshSetup({
      settings: { ...DEFAULT_STORED_DATA.settings, geminiApiKey: 'AIzaSyStoredKey999' },
    });
    await initModule();

    // renderAll should have masked the key
    const keyInput = document.getElementById('api-key') as HTMLInputElement;
    expect(keyInput.value).toContain('••');

    document.getElementById('validate-key')!.click();
    await tick();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'validate-api-key',
      apiKey: 'AIzaSyStoredKey999',
    });
  });
});

// ── 2. Sensitivity change ──────────────────────────────────────────

describe('sensitivity change persists to storage', () => {
  it('saves selected sensitivity value', async () => {
    await freshSetup();
    await initModule();

    const select = document.getElementById('sensitivity') as HTMLSelectElement;
    select.value = 'high';
    select.dispatchEvent(new Event('change'));
    await tick();

    const stored = await getStoredData();
    expect(stored.settings.sensitivity).toBe('high');
  });
});

// ── 3. Theme change ────────────────────────────────────────────────

describe('theme change persists to storage', () => {
  it('saves selected theme value', async () => {
    await freshSetup();
    await initModule();

    const select = document.getElementById('theme') as HTMLSelectElement;
    select.value = 'dark';
    select.dispatchEvent(new Event('change'));
    await tick();

    const stored = await getStoredData();
    expect(stored.settings.theme).toBe('dark');
  });
});

// ── 4. Analyze incoming toggle ─────────────────────────────────────

describe('analyze incoming toggle persists to storage', () => {
  it('saves checked state', async () => {
    await freshSetup();
    await initModule();

    const checkbox = document.getElementById('analyze-incoming') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    await tick();

    const stored = await getStoredData();
    expect(stored.settings.analyzeIncoming).toBe(true);
  });

  it('saves unchecked state', async () => {
    await freshSetup({
      settings: { ...DEFAULT_STORED_DATA.settings, analyzeIncoming: true },
    });
    await initModule();

    const checkbox = document.getElementById('analyze-incoming') as HTMLInputElement;
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
    await tick();

    const stored = await getStoredData();
    expect(stored.settings.analyzeIncoming).toBe(false);
  });
});

// ── 5. Add profile ─────────────────────────────────────────────────

describe('add profile', () => {
  it('valid domain creates a profile entry', async () => {
    await freshSetup();
    await initModule();

    (document.getElementById('new-profile-domain') as HTMLInputElement).value = 'linkedin.com';
    (document.getElementById('new-profile-type') as HTMLSelectElement).value = 'workplace';
    (document.getElementById('new-profile-label') as HTMLInputElement).value = 'boss';
    document.getElementById('add-profile')!.click();
    await tick();

    const stored = await getStoredData();
    expect(stored.relationshipProfiles['linkedin.com']).toEqual({
      type: 'workplace',
      label: 'boss',
    });
  });

  it('invalid domain is rejected', async () => {
    await freshSetup();
    await initModule();

    (document.getElementById('new-profile-domain') as HTMLInputElement).value = 'not valid!!!';
    (document.getElementById('new-profile-type') as HTMLSelectElement).value = 'workplace';
    (document.getElementById('new-profile-label') as HTMLInputElement).value = 'test';
    document.getElementById('add-profile')!.click();
    await tick();

    const stored = await getStoredData();
    expect(Object.keys(stored.relationshipProfiles).length).toBe(0);
  });

  it('empty domain is rejected', async () => {
    await freshSetup();
    await initModule();

    (document.getElementById('new-profile-domain') as HTMLInputElement).value = '';
    document.getElementById('add-profile')!.click();
    await tick();

    const stored = await getStoredData();
    expect(Object.keys(stored.relationshipProfiles).length).toBe(0);
  });

  it('label truncated at 50 chars', async () => {
    await freshSetup();
    await initModule();

    const longLabel = 'A'.repeat(60);
    (document.getElementById('new-profile-domain') as HTMLInputElement).value = 'example.com';
    (document.getElementById('new-profile-type') as HTMLSelectElement).value = 'family';
    (document.getElementById('new-profile-label') as HTMLInputElement).value = longLabel;
    document.getElementById('add-profile')!.click();
    await tick();

    const stored = await getStoredData();
    expect(stored.relationshipProfiles['example.com'].label).toBe('A'.repeat(50));
    expect(stored.relationshipProfiles['example.com'].label.length).toBe(50);
  });

  it('uses type as label when label is empty', async () => {
    await freshSetup();
    await initModule();

    (document.getElementById('new-profile-domain') as HTMLInputElement).value = 'example.com';
    (document.getElementById('new-profile-type') as HTMLSelectElement).value = 'romantic';
    (document.getElementById('new-profile-label') as HTMLInputElement).value = '';
    document.getElementById('add-profile')!.click();
    await tick();

    const stored = await getStoredData();
    expect(stored.relationshipProfiles['example.com'].label).toBe('romantic');
  });

  it('includes per-profile sensitivity when selected', async () => {
    await freshSetup();
    await initModule();

    (document.getElementById('new-profile-domain') as HTMLInputElement).value = 'slack.com';
    (document.getElementById('new-profile-type') as HTMLSelectElement).value = 'workplace';
    (document.getElementById('new-profile-sensitivity') as HTMLSelectElement).value = 'high';
    (document.getElementById('new-profile-label') as HTMLInputElement).value = 'team';
    document.getElementById('add-profile')!.click();
    await tick();

    const stored = await getStoredData();
    expect(stored.relationshipProfiles['slack.com'].sensitivity).toBe('high');
  });

  it('clears input fields after adding', async () => {
    await freshSetup();
    await initModule();

    (document.getElementById('new-profile-domain') as HTMLInputElement).value = 'test.com';
    (document.getElementById('new-profile-type') as HTMLSelectElement).value = 'workplace';
    (document.getElementById('new-profile-label') as HTMLInputElement).value = 'test';
    document.getElementById('add-profile')!.click();
    await tick();

    expect((document.getElementById('new-profile-domain') as HTMLInputElement).value).toBe('');
    expect((document.getElementById('new-profile-label') as HTMLInputElement).value).toBe('');
  });
});

// ── 6. Add domain ──────────────────────────────────────────────────

describe('add domain', () => {
  it('valid domain is added to enabledDomains', async () => {
    await freshSetup();
    await initModule();

    (document.getElementById('new-domain') as HTMLInputElement).value = 'example.com';
    document.getElementById('add-domain')!.click();
    await tick();

    const stored = await getStoredData();
    expect(stored.settings.enabledDomains).toContain('example.com');
  });

  it('duplicate domain is prevented', async () => {
    await freshSetup({
      settings: { ...DEFAULT_STORED_DATA.settings, enabledDomains: ['example.com'] },
    });
    await initModule();

    (document.getElementById('new-domain') as HTMLInputElement).value = 'example.com';
    document.getElementById('add-domain')!.click();
    await tick();

    const stored = await getStoredData();
    expect(stored.settings.enabledDomains.filter((d) => d === 'example.com').length).toBe(1);
  });

  it('invalid domain is rejected', async () => {
    await freshSetup();
    await initModule();

    (document.getElementById('new-domain') as HTMLInputElement).value = '!!!invalid';
    document.getElementById('add-domain')!.click();
    await tick();

    const stored = await getStoredData();
    expect(stored.settings.enabledDomains.length).toBe(0);
  });

  it('empty domain is rejected', async () => {
    await freshSetup();
    await initModule();

    (document.getElementById('new-domain') as HTMLInputElement).value = '';
    document.getElementById('add-domain')!.click();
    await tick();

    const stored = await getStoredData();
    expect(stored.settings.enabledDomains.length).toBe(0);
  });

  it('clears input after adding', async () => {
    await freshSetup();
    await initModule();

    (document.getElementById('new-domain') as HTMLInputElement).value = 'newsite.org';
    document.getElementById('add-domain')!.click();
    await tick();

    expect((document.getElementById('new-domain') as HTMLInputElement).value).toBe('');
  });
});

// ── 7. Add custom pattern ──────────────────────────────────────────

describe('add custom pattern', () => {
  it('valid regex is accepted and saved', async () => {
    await freshSetup();
    await initModule();

    (document.getElementById('new-pattern') as HTMLInputElement).value = '\\bwhy would you\\b';
    document.getElementById('add-pattern')!.click();
    await tick();

    const stored = await getStoredData();
    expect(stored.settings.customPatterns).toContain('\\bwhy would you\\b');
  });

  it('invalid regex shows error (red border)', async () => {
    await freshSetup();
    await initModule();

    const input = document.getElementById('new-pattern') as HTMLInputElement;
    input.value = '[invalid(';
    document.getElementById('add-pattern')!.click();
    await tick();

    expect(input.style.borderColor).toBe('rgb(239, 83, 80)');

    const stored = await getStoredData();
    expect(stored.settings.customPatterns.length).toBe(0);
  });

  it('duplicate pattern is not added twice', async () => {
    await freshSetup({
      settings: { ...DEFAULT_STORED_DATA.settings, customPatterns: ['test.*pattern'] },
    });
    await initModule();

    (document.getElementById('new-pattern') as HTMLInputElement).value = 'test.*pattern';
    document.getElementById('add-pattern')!.click();
    await tick();

    const stored = await getStoredData();
    expect(stored.settings.customPatterns.filter((p) => p === 'test.*pattern').length).toBe(1);
  });

  it('clears input and border after successful add', async () => {
    await freshSetup();
    await initModule();

    const input = document.getElementById('new-pattern') as HTMLInputElement;
    input.value = 'hello';
    document.getElementById('add-pattern')!.click();
    await tick();

    expect(input.value).toBe('');
    expect(input.style.borderColor).toBe('');
  });

  it('empty pattern is rejected', async () => {
    await freshSetup();
    await initModule();

    (document.getElementById('new-pattern') as HTMLInputElement).value = '';
    document.getElementById('add-pattern')!.click();
    await tick();

    const stored = await getStoredData();
    expect(stored.settings.customPatterns.length).toBe(0);
  });
});

// ── 8. Add persona ─────────────────────────────────────────────────

describe('add persona', () => {
  it('label + instruction required — both present succeeds', async () => {
    await freshSetup();
    await initModule();

    (document.getElementById('new-persona-label') as HTMLInputElement).value = 'Supportive friend';
    (document.getElementById('new-persona-instruction') as HTMLInputElement).value =
      'Reply warmly like a close friend';
    document.getElementById('add-persona')!.click();
    await tick();

    const stored = await getStoredData();
    expect(stored.settings.rewritePersonas).toEqual([
      { label: 'Supportive friend', instruction: 'Reply warmly like a close friend' },
    ]);
  });

  it('missing label is rejected', async () => {
    await freshSetup();
    await initModule();

    (document.getElementById('new-persona-label') as HTMLInputElement).value = '';
    (document.getElementById('new-persona-instruction') as HTMLInputElement).value =
      'some instruction';
    document.getElementById('add-persona')!.click();
    await tick();

    const stored = await getStoredData();
    expect(stored.settings.rewritePersonas.length).toBe(0);
  });

  it('missing instruction is rejected', async () => {
    await freshSetup();
    await initModule();

    (document.getElementById('new-persona-label') as HTMLInputElement).value = 'some label';
    (document.getElementById('new-persona-instruction') as HTMLInputElement).value = '';
    document.getElementById('add-persona')!.click();
    await tick();

    const stored = await getStoredData();
    expect(stored.settings.rewritePersonas.length).toBe(0);
  });

  it('clears inputs after adding', async () => {
    await freshSetup();
    await initModule();

    (document.getElementById('new-persona-label') as HTMLInputElement).value = 'Friendly';
    (document.getElementById('new-persona-instruction') as HTMLInputElement).value = 'Be nice';
    document.getElementById('add-persona')!.click();
    await tick();

    expect((document.getElementById('new-persona-label') as HTMLInputElement).value).toBe('');
    expect((document.getElementById('new-persona-instruction') as HTMLInputElement).value).toBe('');
  });
});

// ── 9. Export data ─────────────────────────────────────────────────

describe('export data', () => {
  it('creates a download link with JSON content', async () => {
    await freshSetup();
    await initModule();

    const createObjectURLSpy = vi.fn().mockReturnValue('blob:test-url');
    const revokeObjectURLSpy = vi.fn();
    globalThis.URL.createObjectURL = createObjectURLSpy;
    globalThis.URL.revokeObjectURL = revokeObjectURLSpy;

    const clickSpy = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === 'a') {
        vi.spyOn(el, 'click').mockImplementation(clickSpy);
      }
      return el;
    });

    document.getElementById('export-data')!.click();

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    const blob = createObjectURLSpy.mock.calls[0][0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/json');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:test-url');
  });
});

// ── 10. Import data ────────────────────────────────────────────────

describe('import data', () => {
  it('valid JSON updates storage and re-renders', async () => {
    await freshSetup();
    await initModule();

    const importedData: StoredData = {
      ...structuredClone(DEFAULT_STORED_DATA),
      settings: {
        ...DEFAULT_STORED_DATA.settings,
        sensitivity: 'high',
        geminiApiKey: 'AIzaImportedKey',
      },
      schemaVersion: 2,
    };

    const fileContent = JSON.stringify(importedData);
    const file = new File([fileContent], 'settings.json', { type: 'application/json' });

    const fileInput = document.getElementById('import-file') as HTMLInputElement;
    // Simulate file selection
    Object.defineProperty(fileInput, 'files', { value: [file], writable: true });
    fileInput.dispatchEvent(new Event('change'));
    await tick();
    // Give file.text() promise time to resolve
    await tick();

    const stored = await getStoredData();
    expect(stored.settings.sensitivity).toBe('high');
    expect(stored.settings.geminiApiKey).toBe('AIzaImportedKey');
  });

  it('invalid JSON is rejected and storage unchanged', async () => {
    await freshSetup();
    await initModule();

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const file = new File(['not valid json!!!'], 'bad.json', { type: 'application/json' });
    const fileInput = document.getElementById('import-file') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', { value: [file], writable: true });
    fileInput.dispatchEvent(new Event('change'));
    await tick();
    await tick();

    const stored = await getStoredData();
    expect(stored.settings.sensitivity).toBe('medium'); // unchanged default
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('JSON missing schemaVersion is rejected', async () => {
    await freshSetup();
    await initModule();

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const badData = { settings: { sensitivity: 'high' } }; // no schemaVersion
    const file = new File([JSON.stringify(badData)], 'bad.json', { type: 'application/json' });
    const fileInput = document.getElementById('import-file') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', { value: [file], writable: true });
    fileInput.dispatchEvent(new Event('change'));
    await tick();
    await tick();

    const stored = await getStoredData();
    expect(stored.settings.sensitivity).toBe('medium'); // unchanged
    warnSpy.mockRestore();
  });

  it('import-data button triggers file input click', async () => {
    await freshSetup();
    await initModule();

    const fileInput = document.getElementById('import-file')!;
    const clickSpy = vi.spyOn(fileInput, 'click');

    document.getElementById('import-data')!.click();

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});

// ── Existing tests (preserved) ─────────────────────────────────────

describe('options page rendering', () => {
  it('renders stats section', async () => {
    await freshSetup({
      stats: {
        ...DEFAULT_STORED_DATA.stats,
        totalAnalyzed: 42,
        totalFlagged: 7,
        rewritesAccepted: 3,
        monthlyApiCalls: 15,
      },
    });
    await initModule();

    const stats = document.getElementById('stats')!;
    expect(stats.textContent).toContain('42');
    expect(stats.textContent).toContain('7');
    expect(stats.textContent).toContain('3');
  });

  it('displays masked API key', async () => {
    await freshSetup({
      settings: { ...DEFAULT_STORED_DATA.settings, geminiApiKey: 'AIzaSyD12345678' },
    });
    await initModule();

    const keyInput = document.getElementById('api-key') as HTMLInputElement;
    expect(keyInput.value).toContain('••••••••');
    expect(keyInput.value).toContain('5678');
  });

  it('renders history section', async () => {
    await freshSetup({
      stats: {
        ...DEFAULT_STORED_DATA.stats,
        recentFlags: [
          {
            date: '2026-01-15T10:30:00Z',
            platform: 'gmail',
            riskLevel: 'medium' as const,
            issues: ['passive-aggressive'],
            textSnippet: 'whatever',
          },
        ],
      },
    });
    await initModule();

    const history = document.getElementById('history')!;
    expect(history.textContent).toContain('gmail');
    expect(history.textContent).toContain('whatever');
  });

  it('sets theme select value', async () => {
    await freshSetup({
      settings: { ...DEFAULT_STORED_DATA.settings, theme: 'dark' as const },
    });
    await initModule();

    const themeSelect = document.getElementById('theme') as HTMLSelectElement;
    expect(themeSelect.value).toBe('dark');
  });
});
