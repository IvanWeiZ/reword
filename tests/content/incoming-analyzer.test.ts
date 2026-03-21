import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  PlatformAdapter,
  MessageToBackground,
  MessageFromBackground,
  IncomingAnalysis,
} from '../../src/shared/types';
import { INCOMING_CHECK_INTERVAL_MS } from '../../src/shared/constants';

// ---------------------------------------------------------------------------
// Chrome API mock
// ---------------------------------------------------------------------------
const sendMessageMock = vi.fn<(msg: MessageToBackground) => Promise<MessageFromBackground>>();

function setupChromeMock() {
  (globalThis as Record<string, unknown>).chrome = {
    runtime: {
      sendMessage: sendMessageMock,
    },
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => {}),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Mock adapter
// ---------------------------------------------------------------------------
function createMockAdapter(overrides: Partial<PlatformAdapter> = {}): PlatformAdapter & {
  getIncomingMessageElements: ReturnType<typeof vi.fn>;
  placeIncomingIndicator: ReturnType<typeof vi.fn>;
} {
  const getIncomingMessageElements = vi.fn<() => HTMLElement[]>().mockReturnValue([]);
  const placeIncomingIndicator = vi.fn();

  return {
    platformName: 'test',
    findInputField: vi.fn().mockReturnValue(null),
    placeTriggerIcon: vi.fn().mockReturnValue(null),
    writeBack: vi.fn().mockReturnValue(false),
    scrapeThreadContext: vi.fn().mockReturnValue([]),
    checkHealth: vi.fn().mockReturnValue(true),
    getIncomingMessageElements,
    placeIncomingIndicator,
    ...overrides,
  } as PlatformAdapter & {
    getIncomingMessageElements: ReturnType<typeof vi.fn>;
    placeIncomingIndicator: ReturnType<typeof vi.fn>;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeIncomingResult(result: IncomingAnalysis): MessageFromBackground {
  return { type: 'incoming-result', result };
}

function makeMessageElement(text: string): HTMLElement {
  const el = document.createElement('div');
  el.textContent = text;
  document.body.appendChild(el);
  return el;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('incoming-analyzer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setupChromeMock();
    sendMessageMock.mockReset();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
    document.body.innerHTML = '';
  });

  async function loadModule() {
    const mod = await import('../../src/content/incoming-analyzer');
    return mod;
  }

  it('calls setInterval with INCOMING_CHECK_INTERVAL_MS', async () => {
    const spy = vi.spyOn(globalThis, 'setInterval');
    const { startIncomingAnalysis } = await loadModule();
    const adapter = createMockAdapter();

    startIncomingAnalysis(adapter, 'auto');

    expect(spy).toHaveBeenCalledWith(expect.any(Function), INCOMING_CHECK_INTERVAL_MS);
  });

  it('skips elements already analyzed (no duplicate analysis)', async () => {
    const { startIncomingAnalysis } = await loadModule();
    const adapter = createMockAdapter();
    const el = makeMessageElement('This is a problematic message for analysis');

    adapter.getIncomingMessageElements.mockReturnValue([el]);
    sendMessageMock.mockResolvedValue(
      makeIncomingResult({ riskLevel: 'low', issues: [], interpretation: 'ok' }),
    );

    startIncomingAnalysis(adapter, 'auto');

    // First tick
    await vi.advanceTimersByTimeAsync(INCOMING_CHECK_INTERVAL_MS);
    expect(sendMessageMock).toHaveBeenCalledTimes(1);

    // Second tick — same element should be skipped
    sendMessageMock.mockClear();
    await vi.advanceTimersByTimeAsync(INCOMING_CHECK_INTERVAL_MS);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('skips text shorter than 10 characters', async () => {
    const { startIncomingAnalysis } = await loadModule();
    const adapter = createMockAdapter();
    const el = makeMessageElement('short');

    adapter.getIncomingMessageElements.mockReturnValue([el]);

    startIncomingAnalysis(adapter, 'auto');
    await vi.advanceTimersByTimeAsync(INCOMING_CHECK_INTERVAL_MS);

    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('sends analyze-incoming message for valid text', async () => {
    const { startIncomingAnalysis } = await loadModule();
    const adapter = createMockAdapter();
    const el = makeMessageElement('This message has enough characters for analysis');

    adapter.getIncomingMessageElements.mockReturnValue([el]);
    sendMessageMock.mockResolvedValue(
      makeIncomingResult({ riskLevel: 'low', issues: [], interpretation: 'all good' }),
    );

    startIncomingAnalysis(adapter, 'auto');
    await vi.advanceTimersByTimeAsync(INCOMING_CHECK_INTERVAL_MS);

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: 'analyze-incoming',
      text: 'This message has enough characters for analysis',
      context: [],
    });
  });

  it('creates indicator for medium risk level with correct colors', async () => {
    const { startIncomingAnalysis } = await loadModule();
    const adapter = createMockAdapter();
    const el = makeMessageElement('This passive-aggressive message needs analysis');

    adapter.getIncomingMessageElements.mockReturnValue([el]);
    sendMessageMock.mockResolvedValue(
      makeIncomingResult({
        riskLevel: 'medium',
        issues: ['passive-aggressive tone'],
        interpretation: 'The message sounds dismissive',
      }),
    );

    startIncomingAnalysis(adapter, 'auto');
    await vi.advanceTimersByTimeAsync(INCOMING_CHECK_INTERVAL_MS);

    expect(adapter.placeIncomingIndicator).toHaveBeenCalledTimes(1);
    const indicator = adapter.placeIncomingIndicator.mock.calls[0][1] as HTMLElement;
    expect(indicator.style.backgroundColor).toBe('rgb(255, 243, 224)');
    expect(indicator.style.color).toBe('rgb(230, 81, 0)');
    expect(indicator.textContent).toContain('medium');
    expect(indicator.className).toBe('reword-incoming-indicator');
  });

  it('creates indicator for high risk level with correct colors', async () => {
    const { startIncomingAnalysis } = await loadModule();
    const adapter = createMockAdapter();
    const el = makeMessageElement('This is a very harsh and hostile message text');

    adapter.getIncomingMessageElements.mockReturnValue([el]);
    sendMessageMock.mockResolvedValue(
      makeIncomingResult({
        riskLevel: 'high',
        issues: ['hostile tone', 'personal attack'],
        interpretation: 'The message is aggressive',
      }),
    );

    startIncomingAnalysis(adapter, 'auto');
    await vi.advanceTimersByTimeAsync(INCOMING_CHECK_INTERVAL_MS);

    expect(adapter.placeIncomingIndicator).toHaveBeenCalledTimes(1);
    const indicator = adapter.placeIncomingIndicator.mock.calls[0][1] as HTMLElement;
    expect(indicator.style.backgroundColor).toBe('rgb(255, 235, 238)');
    expect(indicator.style.color).toBe('rgb(198, 40, 40)');
    expect(indicator.textContent).toContain('high');
  });

  it('does NOT create indicator for low risk level', async () => {
    const { startIncomingAnalysis } = await loadModule();
    const adapter = createMockAdapter();
    const el = makeMessageElement('This is a perfectly friendly message to read');

    adapter.getIncomingMessageElements.mockReturnValue([el]);
    sendMessageMock.mockResolvedValue(
      makeIncomingResult({ riskLevel: 'low', issues: [], interpretation: 'Friendly tone' }),
    );

    startIncomingAnalysis(adapter, 'auto');
    await vi.advanceTimersByTimeAsync(INCOMING_CHECK_INTERVAL_MS);

    expect(adapter.placeIncomingIndicator).not.toHaveBeenCalled();
  });

  it('handles getIncomingMessageElements returning undefined (optional method)', async () => {
    const { startIncomingAnalysis } = await loadModule();
    const adapter = createMockAdapter();
    // Simulate adapter without the optional method
    adapter.getIncomingMessageElements = undefined as unknown as ReturnType<typeof vi.fn>;

    startIncomingAnalysis(adapter, 'auto');
    await vi.advanceTimersByTimeAsync(INCOMING_CHECK_INTERVAL_MS);

    // Should not throw, and no messages sent
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('guards against concurrent runs (running flag)', async () => {
    const { startIncomingAnalysis } = await loadModule();
    const adapter = createMockAdapter();
    const el1 = makeMessageElement('First message that takes a long time to process');

    adapter.getIncomingMessageElements.mockReturnValue([el1]);

    // Make sendMessage hang (never resolve) to simulate a long-running analysis
    let resolveFirst!: (value: MessageFromBackground) => void;
    sendMessageMock.mockReturnValueOnce(
      new Promise<MessageFromBackground>((resolve) => {
        resolveFirst = resolve;
      }),
    );

    startIncomingAnalysis(adapter, 'auto');

    // First tick starts processing
    vi.advanceTimersByTime(INCOMING_CHECK_INTERVAL_MS);
    // Allow the interval callback to start (it's async)
    await vi.advanceTimersByTimeAsync(0);

    expect(sendMessageMock).toHaveBeenCalledTimes(1);

    // Second tick — should be skipped because first is still running
    const el2 = makeMessageElement('Second message should be skipped during concurrent run');
    adapter.getIncomingMessageElements.mockReturnValue([el1, el2]);

    vi.advanceTimersByTime(INCOMING_CHECK_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(0);

    // Still only 1 call — the second tick was skipped
    expect(sendMessageMock).toHaveBeenCalledTimes(1);

    // Resolve the first run
    resolveFirst(makeIncomingResult({ riskLevel: 'low', issues: [], interpretation: 'ok' }));
    await vi.advanceTimersByTimeAsync(0);

    // Third tick — should now run again
    sendMessageMock.mockResolvedValue(
      makeIncomingResult({ riskLevel: 'low', issues: [], interpretation: 'ok' }),
    );
    await vi.advanceTimersByTimeAsync(INCOMING_CHECK_INTERVAL_MS);

    // el1 is already in WeakSet, so only el2 should trigger a new call
    expect(sendMessageMock).toHaveBeenCalledTimes(2);
  });

  it('click on indicator toggles tooltip', async () => {
    const { startIncomingAnalysis } = await loadModule();
    const adapter = createMockAdapter();
    const messageEl = makeMessageElement('Dismissive and condescending message text here');

    // placeIncomingIndicator: append the indicator as a sibling
    adapter.placeIncomingIndicator.mockImplementation(
      (_msgEl: HTMLElement, indicator: HTMLElement) => {
        messageEl.parentElement!.appendChild(indicator);
        return () => indicator.remove();
      },
    );

    adapter.getIncomingMessageElements.mockReturnValue([messageEl]);
    sendMessageMock.mockResolvedValue(
      makeIncomingResult({
        riskLevel: 'medium',
        issues: ['dismissive tone'],
        interpretation: 'Could be kinder',
      }),
    );

    startIncomingAnalysis(adapter, 'auto');
    await vi.advanceTimersByTimeAsync(INCOMING_CHECK_INTERVAL_MS);

    const indicator = document.querySelector('.reword-incoming-indicator') as HTMLElement;
    expect(indicator).not.toBeNull();

    // Click to open tooltip
    indicator.click();
    let tooltip = indicator.parentElement!.querySelector('.reword-incoming-tooltip');
    expect(tooltip).not.toBeNull();
    expect(tooltip!.textContent).toContain('Tone analysis');
    expect(tooltip!.textContent).toContain('dismissive tone');
    expect(tooltip!.textContent).toContain('Could be kinder');

    // Click again to close tooltip
    indicator.click();
    tooltip = indicator.parentElement!.querySelector('.reword-incoming-tooltip');
    expect(tooltip).toBeNull();
  });

  it('tooltip auto-removes after 10 seconds', async () => {
    const { startIncomingAnalysis } = await loadModule();
    const adapter = createMockAdapter();
    const messageEl = makeMessageElement('Harsh message that triggers incoming analysis here');

    adapter.placeIncomingIndicator.mockImplementation(
      (_msgEl: HTMLElement, indicator: HTMLElement) => {
        messageEl.parentElement!.appendChild(indicator);
        return () => indicator.remove();
      },
    );

    adapter.getIncomingMessageElements.mockReturnValue([messageEl]);
    sendMessageMock.mockResolvedValue(
      makeIncomingResult({
        riskLevel: 'high',
        issues: ['harsh language'],
        interpretation: 'Very aggressive',
      }),
    );

    startIncomingAnalysis(adapter, 'auto');
    await vi.advanceTimersByTimeAsync(INCOMING_CHECK_INTERVAL_MS);

    const indicator = document.querySelector('.reword-incoming-indicator') as HTMLElement;
    indicator.click();

    let tooltip = indicator.parentElement!.querySelector('.reword-incoming-tooltip');
    expect(tooltip).not.toBeNull();

    // Advance 10 seconds — tooltip should auto-remove
    await vi.advanceTimersByTimeAsync(10000);

    tooltip = indicator.parentElement!.querySelector('.reword-incoming-tooltip');
    expect(tooltip).toBeNull();
  });
});
