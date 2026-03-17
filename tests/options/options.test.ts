import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockChromeStorage } from '../mocks/mock-chrome-storage';
import { DEFAULT_STORED_DATA } from '../../src/shared/constants';

let mockStorage: ReturnType<typeof createMockChromeStorage>;

function setupDOM() {
  document.body.innerHTML = `
    <input id="api-key" type="text" />
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
    <input id="import-file" type="file" style="display:none" />
  `;
}

beforeEach(async () => {
  mockStorage = createMockChromeStorage();
  (globalThis as any).chrome = {
    storage: mockStorage,
    runtime: {
      sendMessage: vi.fn().mockResolvedValue({ valid: true }),
      onMessage: { addListener: vi.fn() },
    },
  };
  setupDOM();
  await mockStorage.local.set({ reword: { ...DEFAULT_STORED_DATA } });
});

describe('isValidDomain (via add-domain behavior)', () => {
  it('rejects empty domain', async () => {
    await import('../../src/options/options');
    await new Promise((r) => setTimeout(r, 0));

    const domainInput = document.getElementById('new-domain') as HTMLInputElement;
    domainInput.value = '';
    document.getElementById('add-domain')!.click();
    await new Promise((r) => setTimeout(r, 0));

    const stored = (await mockStorage.local.get('reword')) as any;
    expect(stored.reword.settings.enabledDomains.length).toBe(0);
  });
});

describe('options page rendering', () => {
  it('renders stats section', async () => {
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

    const dataWithStats = {
      ...DEFAULT_STORED_DATA,
      stats: {
        ...DEFAULT_STORED_DATA.stats,
        totalAnalyzed: 42,
        totalFlagged: 7,
        rewritesAccepted: 3,
        monthlyApiCalls: 15,
      },
    };
    await mockStorage.local.set({ reword: dataWithStats });

    await import('../../src/options/options');
    await new Promise((r) => setTimeout(r, 0));

    const stats = document.getElementById('stats')!;
    expect(stats.textContent).toContain('42');
    expect(stats.textContent).toContain('7');
    expect(stats.textContent).toContain('3');
  });

  it('displays masked API key', async () => {
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

    const dataWithKey = {
      ...DEFAULT_STORED_DATA,
      settings: { ...DEFAULT_STORED_DATA.settings, geminiApiKey: 'AIzaSyD12345678' },
    };
    await mockStorage.local.set({ reword: dataWithKey });

    await import('../../src/options/options');
    await new Promise((r) => setTimeout(r, 0));

    const keyInput = document.getElementById('api-key') as HTMLInputElement;
    expect(keyInput.value).toContain('••••••••');
    expect(keyInput.value).toContain('5678');
  });

  it('renders history section (#1)', async () => {
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

    const dataWithHistory = {
      ...DEFAULT_STORED_DATA,
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
    };
    await mockStorage.local.set({ reword: dataWithHistory });

    await import('../../src/options/options');
    await new Promise((r) => setTimeout(r, 0));

    const history = document.getElementById('history')!;
    expect(history.textContent).toContain('gmail');
    expect(history.textContent).toContain('whatever');
  });

  it('sets theme select value (#10)', async () => {
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

    const dataWithTheme = {
      ...DEFAULT_STORED_DATA,
      settings: { ...DEFAULT_STORED_DATA.settings, theme: 'dark' as const },
    };
    await mockStorage.local.set({ reword: dataWithTheme });

    await import('../../src/options/options');
    await new Promise((r) => setTimeout(r, 0));

    const themeSelect = document.getElementById('theme') as HTMLSelectElement;
    expect(themeSelect.value).toBe('dark');
  });
});
