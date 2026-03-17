import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockChromeStorage } from '../mocks/mock-chrome-storage';
import { DEFAULT_STORED_DATA } from '../../src/shared/constants';

// We test the options page logic by exercising its DOM interactions
// after setting up the required DOM structure and chrome mocks.

let mockStorage: ReturnType<typeof createMockChromeStorage>;

beforeEach(async () => {
  mockStorage = createMockChromeStorage();
  (globalThis as any).chrome = {
    storage: mockStorage,
    runtime: {
      sendMessage: vi.fn().mockResolvedValue({ valid: true }),
      onMessage: { addListener: vi.fn() },
    },
  };

  // Set up the DOM that options.ts expects
  document.body.innerHTML = `
    <input id="api-key" type="text" />
    <button id="validate-key">Validate</button>
    <span id="key-status"></span>
    <select id="sensitivity">
      <option value="low">Low</option>
      <option value="medium" selected>Medium</option>
      <option value="high">High</option>
    </select>
    <div id="profiles-list"></div>
    <input id="new-profile-domain" type="text" />
    <select id="new-profile-type">
      <option value="workplace">Workplace</option>
      <option value="romantic">Romantic</option>
      <option value="family">Family</option>
    </select>
    <input id="new-profile-label" type="text" />
    <button id="add-profile">Add Profile</button>
    <div id="domains-list"></div>
    <input id="new-domain" type="text" />
    <button id="add-domain">Add Domain</button>
    <div id="stats"></div>
  `;

  await mockStorage.local.set({ reword: { ...DEFAULT_STORED_DATA } });
});

describe('isValidDomain (via add-domain behavior)', () => {
  it('rejects empty domain', async () => {
    // Load the module to bind events
    await import('../../src/options/options');
    // Wait for init() microtask
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
    // Re-import to trigger init
    vi.resetModules();

    // Re-setup mocks after module reset
    mockStorage = createMockChromeStorage();
    (globalThis as any).chrome = {
      storage: mockStorage,
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({ valid: true }),
        onMessage: { addListener: vi.fn() },
      },
    };

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
});
