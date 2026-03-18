import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockChromeStorage } from '../mocks/mock-chrome-storage';
import { DEFAULT_STORED_DATA } from '../../src/shared/constants';
import type { StoredData } from '../../src/shared/types';

let mockStorage: ReturnType<typeof createMockChromeStorage>;

function setupDOM() {
  document.body.innerHTML = `
    <input id="api-key" type="password" />
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
    <div id="domains-list"></div>
    <div id="patterns-list"></div>
    <div id="personas-list"></div>
    <div id="suppressed-list"></div>
    <div id="learned-preferences"></div>
    <div id="stats"></div>
    <div id="history"></div>
  `;
}

function makeData(overrides?: Partial<StoredData>): StoredData {
  const base = structuredClone(DEFAULT_STORED_DATA);
  if (overrides) {
    return {
      ...base,
      ...overrides,
      settings: { ...base.settings, ...(overrides.settings ?? {}) },
      stats: { ...base.stats, ...(overrides.stats ?? {}) },
      relationshipProfiles: overrides.relationshipProfiles ?? base.relationshipProfiles,
    } as StoredData;
  }
  return base;
}

function tick() {
  return new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  mockStorage = createMockChromeStorage();
  (globalThis as any).chrome = {
    storage: mockStorage,
    runtime: {
      sendMessage: vi.fn().mockResolvedValue({}),
      onMessage: { addListener: vi.fn() },
    },
  };
  setupDOM();
});

// We import the renderers dynamically after setting up the DOM and chrome mocks
async function importRenderers() {
  // Reset modules so each test gets a fresh import
  vi.resetModules();
  return await import('../../src/options/renderers');
}

// ── esc() ──────────────────────────────────────────────────────────

describe('esc()', () => {
  it('escapes HTML special characters', async () => {
    const { esc } = await importRenderers();
    expect(esc('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert("xss")&lt;/script&gt;',
    );
  });

  it('escapes ampersands', async () => {
    const { esc } = await importRenderers();
    expect(esc('a & b')).toBe('a &amp; b');
  });

  it('returns empty string for empty input', async () => {
    const { esc } = await importRenderers();
    expect(esc('')).toBe('');
  });

  it('passes through plain text unchanged', async () => {
    const { esc } = await importRenderers();
    expect(esc('hello world')).toBe('hello world');
  });
});

// ── renderProfiles() ───────────────────────────────────────────────

describe('renderProfiles()', () => {
  it('renders profile items with domain, type, and label', async () => {
    const { renderProfiles } = await importRenderers();
    const data = makeData({
      relationshipProfiles: {
        'linkedin.com': { type: 'workplace', label: 'boss' },
        'example.com': { type: 'family', label: 'sister' },
      },
    });

    renderProfiles(data);

    const list = document.getElementById('profiles-list')!;
    expect(list.querySelectorAll('.profile-item').length).toBe(2);
    expect(list.textContent).toContain('linkedin.com');
    expect(list.textContent).toContain('workplace');
    expect(list.textContent).toContain('boss');
    expect(list.textContent).toContain('example.com');
    expect(list.textContent).toContain('family');
    expect(list.textContent).toContain('sister');
  });

  it('renders profile with optional sensitivity', async () => {
    const { renderProfiles } = await importRenderers();
    const data = makeData({
      relationshipProfiles: {
        'slack.com': { type: 'workplace', label: 'team', sensitivity: 'high' },
      },
    });

    renderProfiles(data);

    const list = document.getElementById('profiles-list')!;
    expect(list.textContent).toContain('[high]');
  });

  it('does not show sensitivity brackets when sensitivity is undefined', async () => {
    const { renderProfiles } = await importRenderers();
    const data = makeData({
      relationshipProfiles: {
        'test.com': { type: 'romantic', label: 'partner' },
      },
    });

    renderProfiles(data);

    const list = document.getElementById('profiles-list')!;
    expect(list.textContent).not.toContain('[');
  });

  it('renders empty list when no profiles exist', async () => {
    const { renderProfiles } = await importRenderers();
    const data = makeData({ relationshipProfiles: {} });

    renderProfiles(data);

    const list = document.getElementById('profiles-list')!;
    expect(list.querySelectorAll('.profile-item').length).toBe(0);
    expect(list.innerHTML).toBe('');
  });

  it('creates remove buttons with correct data attributes', async () => {
    const { renderProfiles } = await importRenderers();
    const data = makeData({
      relationshipProfiles: {
        'linkedin.com': { type: 'workplace', label: 'boss' },
      },
    });

    renderProfiles(data);

    const btn = document.querySelector('[data-remove-profile="linkedin.com"]');
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toBe('Remove');
  });

  it('remove button deletes the profile and re-renders', async () => {
    const { renderProfiles } = await importRenderers();
    const data = makeData({
      relationshipProfiles: {
        'linkedin.com': { type: 'workplace', label: 'boss' },
        'example.com': { type: 'family', label: 'sister' },
      },
    });
    await mockStorage.local.set({ reword: data });

    renderProfiles(data);

    const btn = document.querySelector('[data-remove-profile="linkedin.com"]') as HTMLElement;
    btn.click();
    await tick();

    // Profile should be removed from data object
    expect(data.relationshipProfiles['linkedin.com']).toBeUndefined();
    expect(data.relationshipProfiles['example.com']).toBeDefined();

    // DOM should be re-rendered with only one item
    const list = document.getElementById('profiles-list')!;
    expect(list.querySelectorAll('.profile-item').length).toBe(1);
    expect(list.textContent).not.toContain('linkedin.com');
    expect(list.textContent).toContain('example.com');
  });

  it('escapes HTML in domain and label to prevent XSS', async () => {
    const { renderProfiles } = await importRenderers();
    const data = makeData({
      relationshipProfiles: {
        '<img src=x onerror=alert(1)>': {
          type: 'workplace',
          label: '<script>evil</script>',
        },
      },
    });

    renderProfiles(data);

    const list = document.getElementById('profiles-list')!;
    // The text content inside <span>/<strong> should be escaped
    const span = list.querySelector('.profile-item span')!;
    expect(span.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(span.innerHTML).toContain('&lt;script&gt;evil&lt;/script&gt;');
    // The text rendered in the visible content should not execute scripts
    expect(span.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(span.textContent).toContain('<script>evil</script>');
  });
});

// ── renderDomains() ────────────────────────────────────────────────

describe('renderDomains()', () => {
  it('renders domain items with domain names', async () => {
    const { renderDomains } = await importRenderers();
    const data = makeData({
      settings: {
        ...DEFAULT_STORED_DATA.settings,
        enabledDomains: ['example.com', 'test.org'],
      },
    });

    renderDomains(data);

    const list = document.getElementById('domains-list')!;
    expect(list.querySelectorAll('.domain-item').length).toBe(2);
    expect(list.textContent).toContain('example.com');
    expect(list.textContent).toContain('test.org');
  });

  it('renders empty list when no domains exist', async () => {
    const { renderDomains } = await importRenderers();
    const data = makeData({ settings: { ...DEFAULT_STORED_DATA.settings, enabledDomains: [] } });

    renderDomains(data);

    const list = document.getElementById('domains-list')!;
    expect(list.querySelectorAll('.domain-item').length).toBe(0);
  });

  it('creates remove buttons with correct data attributes', async () => {
    const { renderDomains } = await importRenderers();
    const data = makeData({
      settings: { ...DEFAULT_STORED_DATA.settings, enabledDomains: ['example.com'] },
    });

    renderDomains(data);

    const btn = document.querySelector('[data-remove-domain="example.com"]');
    expect(btn).not.toBeNull();
  });

  it('remove button deletes the domain and re-renders', async () => {
    const { renderDomains } = await importRenderers();
    const data = makeData({
      settings: {
        ...DEFAULT_STORED_DATA.settings,
        enabledDomains: ['example.com', 'keep.org'],
      },
    });
    await mockStorage.local.set({ reword: data });

    renderDomains(data);

    const btn = document.querySelector('[data-remove-domain="example.com"]') as HTMLElement;
    btn.click();
    await tick();

    expect(data.settings.enabledDomains).toEqual(['keep.org']);

    const list = document.getElementById('domains-list')!;
    expect(list.querySelectorAll('.domain-item').length).toBe(1);
    expect(list.textContent).not.toContain('example.com');
    expect(list.textContent).toContain('keep.org');
  });
});

// ── renderPatterns() ───────────────────────────────────────────────

describe('renderPatterns()', () => {
  it('renders pattern items in code elements', async () => {
    const { renderPatterns } = await importRenderers();
    const data = makeData({
      settings: {
        ...DEFAULT_STORED_DATA.settings,
        customPatterns: ['\\bwhy would you\\b', 'test.*pattern'],
      },
    });

    renderPatterns(data);

    const list = document.getElementById('patterns-list')!;
    expect(list.querySelectorAll('.pattern-item').length).toBe(2);
    expect(list.querySelectorAll('code').length).toBe(2);
    expect(list.textContent).toContain('\\bwhy would you\\b');
    expect(list.textContent).toContain('test.*pattern');
  });

  it('renders empty list when no patterns exist', async () => {
    const { renderPatterns } = await importRenderers();
    const data = makeData({ settings: { ...DEFAULT_STORED_DATA.settings, customPatterns: [] } });

    renderPatterns(data);

    const list = document.getElementById('patterns-list')!;
    expect(list.querySelectorAll('.pattern-item').length).toBe(0);
  });

  it('creates remove buttons with index-based data attributes', async () => {
    const { renderPatterns } = await importRenderers();
    const data = makeData({
      settings: {
        ...DEFAULT_STORED_DATA.settings,
        customPatterns: ['pattern-a', 'pattern-b'],
      },
    });

    renderPatterns(data);

    expect(document.querySelector('[data-remove-pattern="0"]')).not.toBeNull();
    expect(document.querySelector('[data-remove-pattern="1"]')).not.toBeNull();
  });

  it('remove button deletes the pattern by index and re-renders', async () => {
    const { renderPatterns } = await importRenderers();
    const data = makeData({
      settings: {
        ...DEFAULT_STORED_DATA.settings,
        customPatterns: ['first', 'second', 'third'],
      },
    });
    await mockStorage.local.set({ reword: data });

    renderPatterns(data);

    // Remove the middle pattern (index 1 = "second")
    const btn = document.querySelector('[data-remove-pattern="1"]') as HTMLElement;
    btn.click();
    await tick();

    expect(data.settings.customPatterns).toEqual(['first', 'third']);

    const list = document.getElementById('patterns-list')!;
    expect(list.querySelectorAll('.pattern-item').length).toBe(2);
    expect(list.textContent).not.toContain('second');
  });
});

// ── renderPersonas() ───────────────────────────────────────────────

describe('renderPersonas()', () => {
  it('renders persona items with label and instruction', async () => {
    const { renderPersonas } = await importRenderers();
    const data = makeData({
      settings: {
        ...DEFAULT_STORED_DATA.settings,
        rewritePersonas: [
          { label: 'Friendly', instruction: 'Be warm and supportive' },
          { label: 'Professional', instruction: 'Keep it formal' },
        ],
      },
    });

    renderPersonas(data);

    const list = document.getElementById('personas-list')!;
    expect(list.querySelectorAll('.persona-item').length).toBe(2);
    expect(list.textContent).toContain('Friendly');
    expect(list.textContent).toContain('Be warm and supportive');
    expect(list.textContent).toContain('Professional');
    expect(list.textContent).toContain('Keep it formal');
  });

  it('renders persona labels in bold', async () => {
    const { renderPersonas } = await importRenderers();
    const data = makeData({
      settings: {
        ...DEFAULT_STORED_DATA.settings,
        rewritePersonas: [{ label: 'Warm', instruction: 'Be nice' }],
      },
    });

    renderPersonas(data);

    const list = document.getElementById('personas-list')!;
    const strong = list.querySelector('strong');
    expect(strong).not.toBeNull();
    expect(strong!.textContent).toBe('Warm');
  });

  it('renders empty list when no personas exist', async () => {
    const { renderPersonas } = await importRenderers();
    const data = makeData({ settings: { ...DEFAULT_STORED_DATA.settings, rewritePersonas: [] } });

    renderPersonas(data);

    const list = document.getElementById('personas-list')!;
    expect(list.querySelectorAll('.persona-item').length).toBe(0);
  });

  it('remove button deletes the persona by index and re-renders', async () => {
    const { renderPersonas } = await importRenderers();
    const data = makeData({
      settings: {
        ...DEFAULT_STORED_DATA.settings,
        rewritePersonas: [
          { label: 'Keep', instruction: 'keep this' },
          { label: 'Remove', instruction: 'remove this' },
        ],
      },
    });
    await mockStorage.local.set({ reword: data });

    renderPersonas(data);

    const btn = document.querySelector('[data-remove-persona="1"]') as HTMLElement;
    btn.click();
    await tick();

    expect(data.settings.rewritePersonas).toEqual([{ label: 'Keep', instruction: 'keep this' }]);

    const list = document.getElementById('personas-list')!;
    expect(list.querySelectorAll('.persona-item').length).toBe(1);
    // The removed persona's label should not appear in any <strong> tag
    const labels = Array.from(list.querySelectorAll('strong')).map((el) => el.textContent);
    expect(labels).not.toContain('Remove');
    expect(labels).toContain('Keep');
  });

  it('escapes HTML in persona label and instruction', async () => {
    const { renderPersonas } = await importRenderers();
    const data = makeData({
      settings: {
        ...DEFAULT_STORED_DATA.settings,
        rewritePersonas: [
          { label: '<b>bold</b>', instruction: '<script>alert(1)</script>' },
        ],
      },
    });

    renderPersonas(data);

    const list = document.getElementById('personas-list')!;
    // The only <strong> should be from the template, not from injected HTML
    expect(list.innerHTML).not.toContain('<script>alert');
    expect(list.innerHTML).toContain('&lt;script&gt;');
  });
});

// ── renderStats() ──────────────────────────────────────────────────

describe('renderStats()', () => {
  it('renders all stat values', async () => {
    const { renderStats } = await importRenderers();
    const data = makeData({
      stats: {
        ...DEFAULT_STORED_DATA.stats,
        totalAnalyzed: 100,
        totalFlagged: 25,
        rewritesAccepted: 10,
        monthlyApiCalls: 50,
      },
    });

    renderStats(data);

    const stats = document.getElementById('stats')!;
    expect(stats.textContent).toContain('100');
    expect(stats.textContent).toContain('25');
    expect(stats.textContent).toContain('10');
    expect(stats.textContent).toContain('50');
  });

  it('renders correct labels for each stat', async () => {
    const { renderStats } = await importRenderers();
    const data = makeData();

    renderStats(data);

    const stats = document.getElementById('stats')!;
    expect(stats.textContent).toContain('Messages analyzed');
    expect(stats.textContent).toContain('Messages flagged');
    expect(stats.textContent).toContain('Rewrites accepted');
    expect(stats.textContent).toContain('API calls this month');
  });

  it('renders zero values correctly', async () => {
    const { renderStats } = await importRenderers();
    const data = makeData();

    renderStats(data);

    const stats = document.getElementById('stats')!;
    expect(stats.textContent).toContain('Messages analyzed: 0');
    expect(stats.textContent).toContain('Messages flagged: 0');
  });
});

// ── renderHistory() ────────────────────────────────────────────────

describe('renderHistory()', () => {
  it('shows hint message when no flags exist', async () => {
    const { renderHistory } = await importRenderers();
    const data = makeData({ stats: { ...DEFAULT_STORED_DATA.stats, recentFlags: [] } });

    renderHistory(data);

    const history = document.getElementById('history')!;
    expect(history.textContent).toContain('No flagged messages yet');
    expect(history.querySelector('.hint')).not.toBeNull();
  });

  it('renders flag events with platform, risk level, and snippet', async () => {
    const { renderHistory } = await importRenderers();
    const data = makeData({
      stats: {
        ...DEFAULT_STORED_DATA.stats,
        recentFlags: [
          {
            date: '2026-01-15T10:30:00Z',
            platform: 'gmail',
            riskLevel: 'high',
            issues: ['hostile'],
            textSnippet: 'Why would you even do that?',
          },
          {
            date: '2026-02-20T14:00:00Z',
            platform: 'linkedin',
            riskLevel: 'medium',
            issues: ['passive-aggressive'],
            textSnippet: 'Per my last email...',
          },
        ],
      },
    });

    renderHistory(data);

    const history = document.getElementById('history')!;
    expect(history.querySelectorAll('.history-item').length).toBe(2);
    expect(history.textContent).toContain('gmail');
    expect(history.textContent).toContain('linkedin');
    expect(history.textContent).toContain('Why would you even do that?');
    expect(history.textContent).toContain('Per my last email...');
  });

  it('applies correct risk level CSS classes', async () => {
    const { renderHistory } = await importRenderers();
    const data = makeData({
      stats: {
        ...DEFAULT_STORED_DATA.stats,
        recentFlags: [
          {
            date: '2026-01-15T10:30:00Z',
            platform: 'gmail',
            riskLevel: 'high',
            issues: [],
            textSnippet: 'test',
          },
        ],
      },
    });

    renderHistory(data);

    const riskSpan = document.querySelector('.history-risk-high');
    expect(riskSpan).not.toBeNull();
    expect(riskSpan!.textContent).toBe('high');
  });

  it('limits display to 50 items', async () => {
    const { renderHistory } = await importRenderers();
    const flags = Array.from({ length: 60 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
      platform: 'gmail',
      riskLevel: 'low' as const,
      issues: [],
      textSnippet: `message ${i}`,
    }));
    const data = makeData({ stats: { ...DEFAULT_STORED_DATA.stats, recentFlags: flags } });

    renderHistory(data);

    const history = document.getElementById('history')!;
    expect(history.querySelectorAll('.history-item').length).toBe(50);
  });

  it('escapes HTML in platform and snippet', async () => {
    const { renderHistory } = await importRenderers();
    const data = makeData({
      stats: {
        ...DEFAULT_STORED_DATA.stats,
        recentFlags: [
          {
            date: '2026-01-01T00:00:00Z',
            platform: '<img src=x>',
            riskLevel: 'low',
            issues: [],
            textSnippet: '<script>alert(1)</script>',
          },
        ],
      },
    });

    renderHistory(data);

    const history = document.getElementById('history')!;
    expect(history.innerHTML).not.toContain('<img src=x>');
    expect(history.innerHTML).not.toContain('<script>alert');
    expect(history.innerHTML).toContain('&lt;img src=x&gt;');
  });
});

// ── renderAll() ────────────────────────────────────────────────────

describe('renderAll()', () => {
  it('populates api-key input with masked key', async () => {
    const { renderAll } = await importRenderers();
    const data = makeData({
      settings: { ...DEFAULT_STORED_DATA.settings, geminiApiKey: 'AIzaSyD12345678' },
    });

    renderAll(data);

    const keyInput = document.getElementById('api-key') as HTMLInputElement;
    expect(keyInput.value).toContain('••••••••');
    expect(keyInput.value).toContain('5678');
  });

  it('leaves api-key empty when no key is set', async () => {
    const { renderAll } = await importRenderers();
    const data = makeData({ settings: { ...DEFAULT_STORED_DATA.settings, geminiApiKey: '' } });

    renderAll(data);

    const keyInput = document.getElementById('api-key') as HTMLInputElement;
    expect(keyInput.value).toBe('');
  });

  it('sets sensitivity select to stored value', async () => {
    const { renderAll } = await importRenderers();
    const data = makeData({
      settings: { ...DEFAULT_STORED_DATA.settings, sensitivity: 'high' },
    });

    renderAll(data);

    const select = document.getElementById('sensitivity') as HTMLSelectElement;
    expect(select.value).toBe('high');
  });

  it('sets theme select to stored value', async () => {
    const { renderAll } = await importRenderers();
    const data = makeData({
      settings: { ...DEFAULT_STORED_DATA.settings, theme: 'dark' },
    });

    renderAll(data);

    const themeSelect = document.getElementById('theme') as HTMLSelectElement;
    expect(themeSelect.value).toBe('dark');
  });

  it('sets analyze-incoming checkbox to stored value', async () => {
    const { renderAll } = await importRenderers();
    const data = makeData({
      settings: { ...DEFAULT_STORED_DATA.settings, analyzeIncoming: true },
    });

    renderAll(data);

    const checkbox = document.getElementById('analyze-incoming') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('renders all sub-sections (profiles, domains, patterns, personas, stats, history)', async () => {
    const { renderAll } = await importRenderers();
    const data = makeData({
      settings: {
        ...DEFAULT_STORED_DATA.settings,
        geminiApiKey: 'AIzaSyTestKey123',
        sensitivity: 'low',
        theme: 'light',
        analyzeIncoming: true,
        enabledDomains: ['custom.com'],
        customPatterns: ['test-pattern'],
        rewritePersonas: [{ label: 'Friendly', instruction: 'Be warm' }],
      },
      relationshipProfiles: {
        'work.com': { type: 'workplace', label: 'coworker' },
      },
      stats: {
        ...DEFAULT_STORED_DATA.stats,
        totalAnalyzed: 50,
        totalFlagged: 5,
        rewritesAccepted: 2,
        monthlyApiCalls: 20,
        recentFlags: [
          {
            date: '2026-03-01T00:00:00Z',
            platform: 'twitter',
            riskLevel: 'medium',
            issues: ['dismissive'],
            textSnippet: 'whatever you say',
          },
        ],
      },
    });

    renderAll(data);

    // Verify all sections populated
    expect(document.getElementById('profiles-list')!.textContent).toContain('work.com');
    expect(document.getElementById('domains-list')!.textContent).toContain('custom.com');
    expect(document.getElementById('patterns-list')!.textContent).toContain('test-pattern');
    expect(document.getElementById('personas-list')!.textContent).toContain('Friendly');
    expect(document.getElementById('stats')!.textContent).toContain('50');
    expect(document.getElementById('history')!.textContent).toContain('twitter');
  });
});
