import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  PlatformAdapter,
  MessageToBackground,
  MessageFromBackground,
  StoredData,
  AnalysisResult,
} from '../../src/shared/types';
import { HEURISTIC_THRESHOLD, DEFAULT_STORED_DATA } from '../../src/shared/constants';

// ---------------------------------------------------------------------------
// Chrome API mock
// ---------------------------------------------------------------------------
const sendMessageMock = vi.fn<(msg: MessageToBackground) => Promise<MessageFromBackground>>();

function setupChromeMock() {
  const store: Record<string, unknown> = {};
  (globalThis as Record<string, unknown>).chrome = {
    runtime: {
      sendMessage: sendMessageMock,
    },
    storage: {
      local: {
        get: vi.fn(async (keys?: string | string[] | null) => {
          if (!keys) return { ...store };
          const keyList = typeof keys === 'string' ? [keys] : keys;
          const result: Record<string, unknown> = {};
          for (const k of keyList) {
            if (k in store) result[k] = store[k];
          }
          return result;
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(store, items);
        }),
        clear: vi.fn(async () => {
          for (const k of Object.keys(store)) delete store[k];
        }),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function settingsResponse(overrides: Partial<StoredData['settings']> = {}): MessageFromBackground {
  return {
    type: 'settings',
    data: {
      ...DEFAULT_STORED_DATA,
      settings: { ...DEFAULT_STORED_DATA.settings, ...overrides },
    },
  };
}

function analysisResultResponse(shouldFlag: boolean): MessageFromBackground {
  const result: AnalysisResult = {
    shouldFlag,
    riskLevel: 'medium',
    issues: ['passive-aggressive'],
    explanation: 'test explanation',
    rewrites: [{ label: 'Kinder', text: 'Rewritten text' }],
  };
  return { type: 'analysis-result', result };
}

// Save all originals once at module level (before any wrapping)
const _realSetTimeout = globalThis.setTimeout;
const _realClearTimeout = globalThis.clearTimeout;
const _realSetInterval = globalThis.setInterval;
const _realClearInterval = globalThis.clearInterval;
const _origDocAdd = Document.prototype.addEventListener;
const _origDocRemove = Document.prototype.removeEventListener;
const _origWinAdd = window.addEventListener.bind(window);
const _origWinRemove = window.removeEventListener.bind(window);

/**
 * Flush pending microtasks/promises.
 */
function flushAsync(): Promise<void> {
  return new Promise<void>((resolve) => {
    let rounds = 0;
    function tick() {
      if (rounds++ < 5) {
        _realSetTimeout(tick, 0);
      } else {
        resolve();
      }
    }
    tick();
  });
}

// ---------------------------------------------------------------------------
// Event listener tracker
// ---------------------------------------------------------------------------

type ListenerRecord = {
  target: EventTarget;
  type: string;
  listener: EventListenerOrEventListenerObject;
  options?: boolean | AddEventListenerOptions;
};

let registeredListeners: ListenerRecord[] = [];

function installListenerTracking() {
  document.addEventListener = function (
    this: Document,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) {
    registeredListeners.push({ target: this, type, listener, options });
    return _origDocAdd.call(this, type, listener, options);
  } as typeof document.addEventListener;

  // Use prototype method to avoid capturing wrapped version
  window.addEventListener = function (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) {
    registeredListeners.push({ target: window, type, listener, options });
    return _origWinAdd.call(window, type, listener, options);
  } as typeof window.addEventListener;
}

function removeAllTrackedListeners() {
  for (const { target, type, listener, options } of registeredListeners) {
    try {
      if (target === document) {
        _origDocRemove.call(document, type, listener, options);
      } else {
        _origWinRemove.call(window, type, listener, options);
      }
    } catch {
      // ignore
    }
  }
  registeredListeners = [];
}

function restoreListenerMethods() {
  document.addEventListener = _origDocAdd;
  document.removeEventListener = _origDocRemove;
  window.addEventListener = _origWinAdd as typeof window.addEventListener;
  window.removeEventListener = _origWinRemove as typeof window.removeEventListener;
}

// ---------------------------------------------------------------------------
// 1. detectAdapter() — adapter selection per hostname
// ---------------------------------------------------------------------------

describe('detectAdapter() — adapter selection per hostname', () => {
  const cases: Array<{ hostname: string; expectedPlatform: string }> = [
    { hostname: 'mail.google.com', expectedPlatform: 'gmail' },
    { hostname: 'www.linkedin.com', expectedPlatform: 'linkedin' },
    { hostname: 'x.com', expectedPlatform: 'twitter' },
    { hostname: 'twitter.com', expectedPlatform: 'twitter' },
    { hostname: 'app.slack.com', expectedPlatform: 'slack' },
    { hostname: 'myteam.slack.com', expectedPlatform: 'slack' },
    { hostname: 'discord.com', expectedPlatform: 'discord' },
    { hostname: 'outlook.live.com', expectedPlatform: 'outlook' },
    { hostname: 'outlook.office.com', expectedPlatform: 'outlook' },
    { hostname: 'teams.microsoft.com', expectedPlatform: 'teams' },
    { hostname: 'web.whatsapp.com', expectedPlatform: 'whatsapp' },
    { hostname: 'example.com', expectedPlatform: 'generic' },
  ];

  for (const { hostname, expectedPlatform } of cases) {
    it(`returns ${expectedPlatform} adapter for hostname "${hostname}"`, async () => {
      Object.defineProperty(window, 'location', {
        value: { hostname },
        writable: true,
        configurable: true,
      });

      const { GmailAdapter } = await import('../../src/adapters/gmail');
      const { LinkedInAdapter } = await import('../../src/adapters/linkedin');
      const { TwitterAdapter } = await import('../../src/adapters/twitter');
      const { SlackAdapter } = await import('../../src/adapters/slack');
      const { DiscordAdapter } = await import('../../src/adapters/discord');
      const { OutlookAdapter } = await import('../../src/adapters/outlook');
      const { TeamsAdapter } = await import('../../src/adapters/teams');
      const { WhatsAppAdapter } = await import('../../src/adapters/whatsapp');
      const { GenericFallbackAdapter } = await import('../../src/adapters/base');

      function detectAdapter(): PlatformAdapter {
        const host = window.location.hostname;
        if (host === 'mail.google.com') return new GmailAdapter();
        if (host === 'www.linkedin.com') return new LinkedInAdapter();
        if (host === 'x.com' || host === 'twitter.com') return new TwitterAdapter();
        if (host.endsWith('.slack.com') || host === 'app.slack.com') return new SlackAdapter();
        if (host === 'discord.com') return new DiscordAdapter();
        if (host === 'outlook.live.com' || host === 'outlook.office.com')
          return new OutlookAdapter();
        if (host === 'teams.microsoft.com') return new TeamsAdapter();
        if (host === 'web.whatsapp.com') return new WhatsAppAdapter();
        return new GenericFallbackAdapter();
      }

      const adapter = detectAdapter();
      expect(adapter.platformName).toBe(expectedPlatform);
    });
  }
});

// ---------------------------------------------------------------------------
// 2-6. Integration tests
// ---------------------------------------------------------------------------

describe('content script init() orchestration', () => {
  const mockScoreMessage = vi.fn<(text: string, patterns?: string[]) => number>();
  const mockPopupSetTheme = vi.fn();
  const mockPopupElement = document.createElement('div');
  const mockFindInputField = vi.fn<() => HTMLElement | null>();
  const mockWriteBack = vi.fn();
  const mockScrapeThreadContext = vi.fn().mockReturnValue([]);

  // Timer capture
  let intervalCallbacks: Array<() => void>;
  let timeoutCallbacks: Map<number, () => void>;
  let nextTimeoutId: number;

  beforeEach(() => {
    intervalCallbacks = [];
    timeoutCallbacks = new Map();
    nextTimeoutId = 1;

    // Replace timers with manual capture
    globalThis.setInterval = ((fn: () => void) => {
      intervalCallbacks.push(fn);
      return intervalCallbacks.length as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval;
    globalThis.clearInterval = (() => {}) as typeof clearInterval;
    globalThis.setTimeout = ((fn: () => void) => {
      const id = nextTimeoutId++;
      timeoutCallbacks.set(id, fn);
      return id as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;
    globalThis.clearTimeout = ((id: number) => {
      timeoutCallbacks.delete(id);
    }) as typeof clearTimeout;

    installListenerTracking();
    setupChromeMock();
    document.body.innerHTML = '';

    sendMessageMock.mockReset();
    mockScoreMessage.mockReset();
    mockPopupSetTheme.mockReset();
    mockFindInputField.mockReset();
    mockWriteBack.mockReset();
    mockScrapeThreadContext.mockReset().mockReturnValue([]);

    mockFindInputField.mockReturnValue(null);
    mockScoreMessage.mockReturnValue(0);

    sendMessageMock.mockImplementation(async (msg: MessageToBackground) => {
      if (msg.type === 'get-settings') return settingsResponse();
      if (msg.type === 'analyze') return analysisResultResponse(true);
      if (msg.type === 'increment-stat') return settingsResponse();
      if (msg.type === 'record-flag') return settingsResponse();
      if (msg.type === 'record-dismiss') return settingsResponse();
      return settingsResponse();
    });

    function makeAdapterClass(name: string) {
      return class {
        platformName = name;
        findInputField = mockFindInputField;
        placeTriggerIcon = vi.fn().mockReturnValue(() => {});
        writeBack = mockWriteBack;
        scrapeThreadContext = mockScrapeThreadContext;
        checkHealth = vi.fn().mockReturnValue(true);
      };
    }

    vi.doMock('../../src/adapters', () => ({
      GmailAdapter: makeAdapterClass('gmail'),
      LinkedInAdapter: makeAdapterClass('linkedin'),
      TwitterAdapter: makeAdapterClass('twitter'),
      SlackAdapter: makeAdapterClass('slack'),
      DiscordAdapter: makeAdapterClass('discord'),
      OutlookAdapter: makeAdapterClass('outlook'),
      TeamsAdapter: makeAdapterClass('teams'),
      WhatsAppAdapter: makeAdapterClass('whatsapp'),
      GenericFallbackAdapter: makeAdapterClass('generic'),
    }));

    vi.doMock('../../src/content/popup-card', () => ({
      PopupCard: class {
        show = vi.fn();
        hide = vi.fn();
        showStreaming = vi.fn();
        setTheme = mockPopupSetTheme;
        positionNear = vi.fn();
        element = mockPopupElement;
        constructor(_opts: unknown) {}
      },
    }));

    vi.doMock('../../src/content/heuristic-scorer', () => ({
      scoreMessage: mockScoreMessage,
    }));

    vi.doMock('../../src/content/helpers', () => ({
      normalizeSnippet: (text: string) => text.toLowerCase().slice(0, 60),
      deriveRecipientStyle: () => undefined,
      escapeHTML: (text: string) => text,
      renderDiffHTML: (original: string, rewritten: string) =>
        `<span class="reword-diff-removed">${original}</span> <span class="reword-diff-added">${rewritten}</span>`,
    }));

    vi.doMock('../../src/content/incoming-analyzer', () => ({
      startIncomingAnalysis: vi.fn(),
    }));
  });

  afterEach(() => {
    removeAllTrackedListeners();
    restoreListenerMethods();

    globalThis.setInterval = _realSetInterval;
    globalThis.clearInterval = _realClearInterval;
    globalThis.setTimeout = _realSetTimeout;
    globalThis.clearTimeout = _realClearTimeout;

    vi.restoreAllMocks();
    vi.resetModules();
    document.body.innerHTML = '';
  });

  async function loadContentScript() {
    Object.defineProperty(window, 'location', {
      value: { hostname: 'example.com' },
      writable: true,
      configurable: true,
    });

    await import('../../src/content/index');
    await flushAsync();
  }

  async function fireDebounceTimers(): Promise<void> {
    const pending = new Map(timeoutCallbacks);
    timeoutCallbacks.clear();
    for (const [, fn] of pending) {
      fn();
    }
    await flushAsync();
  }

  function firePollingInterval(): void {
    for (const cb of intervalCallbacks) {
      cb();
    }
  }

  /**
   * Create a contenteditable div, trigger focusin, set text, fire input.
   * The content script only detects contenteditable / role=textbox via focusin.
   */
  function createEditableAndType(text: string): HTMLDivElement {
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    document.body.appendChild(editable);
    editable.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    editable.textContent = text;
    editable.dispatchEvent(new Event('input', { bubbles: true }));
    return editable;
  }

  // --- Initialization ---

  describe('initialization', () => {
    it('sends get-settings message on init', async () => {
      await loadContentScript();

      const settingsCalls = sendMessageMock.mock.calls.filter(
        ([msg]) => (msg as MessageToBackground).type === 'get-settings',
      );
      expect(settingsCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('applies theme from settings response', async () => {
      sendMessageMock.mockImplementation(async (msg: MessageToBackground) => {
        if (msg.type === 'get-settings') return settingsResponse({ theme: 'dark' });
        return settingsResponse();
      });

      await loadContentScript();

      expect(mockPopupSetTheme).toHaveBeenCalledWith('dark');
    });
  });

  // --- Warning banner ---

  describe('warning banner', () => {
    it('shows warning banner when a harsh message is typed', async () => {
      await loadContentScript();
      mockScoreMessage.mockReturnValue(HEURISTIC_THRESHOLD + 0.2);

      createEditableAndType('This is stupid and ridiculous, you are terrible!!');
      await fireDebounceTimers();

      const banner = document.getElementById('reword-warning-banner');
      expect(banner).not.toBeNull();
      expect(banner!.style.display).toBe('block');
    });

    it('does not show warning banner when heuristic score is below threshold', async () => {
      await loadContentScript();
      mockScoreMessage.mockReturnValue(HEURISTIC_THRESHOLD - 0.1);

      createEditableAndType('Hello, how are you doing today? This is a nice message.');

      // Score below threshold => no debounce timer set
      expect(timeoutCallbacks.size).toBe(0);

      const banner = document.getElementById('reword-warning-banner');
      expect(banner).not.toBeNull();
      expect(banner!.style.display).toBe('none');
    });

    it('hides warning banner when message is too short', async () => {
      await loadContentScript();
      mockScoreMessage.mockReturnValue(HEURISTIC_THRESHOLD + 0.2);

      createEditableAndType('hi');

      expect(timeoutCallbacks.size).toBe(0);

      const banner = document.getElementById('reword-warning-banner');
      expect(banner).not.toBeNull();
      expect(banner!.style.display).toBe('none');
    });
  });

  // --- AI analysis ---

  describe('AI analysis', () => {
    it('sends analyze message with correct payload when heuristic triggers', async () => {
      await loadContentScript();
      mockScoreMessage.mockReturnValue(HEURISTIC_THRESHOLD + 0.2);

      createEditableAndType('This is stupid and ridiculous!!');
      await fireDebounceTimers();

      const analyzeCalls = sendMessageMock.mock.calls.filter(
        ([msg]) => (msg as MessageToBackground).type === 'analyze',
      );
      expect(analyzeCalls.length).toBe(1);
      const analyzeMsg = analyzeCalls[0][0] as Extract<MessageToBackground, { type: 'analyze' }>;
      expect(analyzeMsg.text).toBe('This is stupid and ridiculous!!');
      expect(analyzeMsg.relationshipType).toBe('workplace');
      expect(analyzeMsg.sensitivity).toBe('medium');
    });

    it('shows analysis results in banner when AI flags the message', async () => {
      sendMessageMock.mockImplementation(async (msg: MessageToBackground) => {
        if (msg.type === 'get-settings') return settingsResponse();
        if (msg.type === 'analyze') return analysisResultResponse(true);
        if (msg.type === 'record-flag') return settingsResponse();
        return settingsResponse();
      });

      await loadContentScript();
      mockScoreMessage.mockReturnValue(HEURISTIC_THRESHOLD + 0.2);

      createEditableAndType('Per my last email, whatever you say is fine.');
      await fireDebounceTimers();

      const banner = document.getElementById('reword-warning-banner');
      expect(banner).not.toBeNull();
      expect(banner!.style.display).toBe('block');
      expect(banner!.textContent).toContain('test explanation');
    });

    it('hides banner when AI analysis does not flag the message', async () => {
      sendMessageMock.mockImplementation(async (msg: MessageToBackground) => {
        if (msg.type === 'get-settings') return settingsResponse();
        if (msg.type === 'analyze') return analysisResultResponse(false);
        return settingsResponse();
      });

      await loadContentScript();
      mockScoreMessage.mockReturnValue(HEURISTIC_THRESHOLD + 0.2);

      createEditableAndType('Some text that passes heuristic but not AI');
      await fireDebounceTimers();

      const banner = document.getElementById('reword-warning-banner');
      expect(banner).not.toBeNull();
      expect(banner!.style.display).toBe('none');
    });

    it('sends record-flag message after a flagged analysis', async () => {
      sendMessageMock.mockImplementation(async (msg: MessageToBackground) => {
        if (msg.type === 'get-settings') return settingsResponse();
        if (msg.type === 'analyze') return analysisResultResponse(true);
        if (msg.type === 'record-flag') return settingsResponse();
        return settingsResponse();
      });

      await loadContentScript();
      mockScoreMessage.mockReturnValue(HEURISTIC_THRESHOLD + 0.2);

      createEditableAndType('This is stupid and pathetic!!');
      await fireDebounceTimers();

      const flagCalls = sendMessageMock.mock.calls.filter(
        ([msg]) => (msg as MessageToBackground).type === 'record-flag',
      );
      expect(flagCalls.length).toBe(1);
      const flagMsg = flagCalls[0][0] as Extract<MessageToBackground, { type: 'record-flag' }>;
      expect(flagMsg.event.platform).toBe('generic');
      expect(flagMsg.event.riskLevel).toBe('medium');
    });

    it('renders inline diff HTML in rewrite buttons when rewrites are present', async () => {
      sendMessageMock.mockImplementation(async (msg: MessageToBackground) => {
        if (msg.type === 'get-settings') return settingsResponse();
        if (msg.type === 'analyze') return analysisResultResponse(true);
        if (msg.type === 'record-flag') return settingsResponse();
        return settingsResponse();
      });

      await loadContentScript();
      mockScoreMessage.mockReturnValue(HEURISTIC_THRESHOLD + 0.2);

      createEditableAndType('This is stupid and pathetic!!');
      await fireDebounceTimers();

      const banner = document.getElementById('reword-warning-banner');
      expect(banner).not.toBeNull();

      const rewriteBtn = banner!.querySelector('.reword-use-rewrite');
      expect(rewriteBtn).not.toBeNull();

      const btnHTML = rewriteBtn!.innerHTML;
      expect(btnHTML).toContain('reword-diff-added');
      expect(btnHTML).toContain('reword-diff-removed');
    });
  });

  // --- Popup / banner element appended to body ---

  describe('popup element', () => {
    it('appends the warning banner element to document.body', async () => {
      await loadContentScript();

      const banner = document.getElementById('reword-warning-banner');
      expect(banner).not.toBeNull();
      expect(document.body.contains(banner)).toBe(true);
    });
  });

  // --- Input detection ---

  describe('input detection', () => {
    it('attaches input listener when a contenteditable element receives focus', async () => {
      await loadContentScript();
      mockScoreMessage.mockReturnValue(HEURISTIC_THRESHOLD + 0.2);

      createEditableAndType('This is a really terrible and rude message to send!');
      await fireDebounceTimers();

      const analyzeCalls = sendMessageMock.mock.calls.filter(
        ([msg]) => (msg as MessageToBackground).type === 'analyze',
      );
      expect(analyzeCalls.length).toBe(1);
    });

    it('polls for input fields via setInterval', async () => {
      const editable = document.createElement('div');
      editable.setAttribute('contenteditable', 'true');
      document.body.appendChild(editable);
      mockFindInputField.mockReturnValue(editable);

      await loadContentScript();

      // Fire the setInterval callback to discover the element
      firePollingInterval();

      mockScoreMessage.mockReturnValue(HEURISTIC_THRESHOLD + 0.2);
      editable.textContent = 'This is absolutely terrible and pathetic work!!';
      editable.dispatchEvent(new Event('input', { bubbles: true }));

      await fireDebounceTimers();

      const analyzeCalls = sendMessageMock.mock.calls.filter(
        ([msg]) => (msg as MessageToBackground).type === 'analyze',
      );
      expect(analyzeCalls.length).toBe(1);
    });
  });

  // --- shadow-pierce.js integration ---

  describe('shadow-pierce.js integration', () => {
    it('triggers analysis when reword-send-intercept message is received', async () => {
      await loadContentScript();

      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'reword-send-intercept',
            text: 'This is a really rude and terrible message!',
          },
        }),
      );

      await flushAsync();

      const analyzeCalls = sendMessageMock.mock.calls.filter(
        ([msg]) => (msg as MessageToBackground).type === 'analyze',
      );
      expect(analyzeCalls.length).toBe(1);
      const analyzeMsg = analyzeCalls[0][0] as Extract<MessageToBackground, { type: 'analyze' }>;
      expect(analyzeMsg.text).toBe('This is a really rude and terrible message!');
    });

    it('ignores reword-send-intercept with short text', async () => {
      await loadContentScript();

      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'reword-send-intercept',
            text: 'hi',
          },
        }),
      );

      await flushAsync();

      const analyzeCalls = sendMessageMock.mock.calls.filter(
        ([msg]) => (msg as MessageToBackground).type === 'analyze',
      );
      expect(analyzeCalls).toHaveLength(0);
    });
  });
});
