import type {
  PlatformAdapter,
  AnalysisResult,
  MessageToBackground,
  MessageFromBackground,
} from '../shared/types';
import { MIN_MESSAGE_LENGTH, HEURISTIC_THRESHOLD, AI_DEBOUNCE_MS } from '../shared/constants';
import { scoreMessage } from './heuristic-scorer';
import { PopupCard } from './popup-card';
import { normalizeSnippet, renderDiffHTML } from './helpers';
import {
  GmailAdapter,
  LinkedInAdapter,
  TwitterAdapter,
  SlackAdapter,
  DiscordAdapter,
  OutlookAdapter,
  TeamsAdapter,
  WhatsAppAdapter,
  GenericFallbackAdapter,
} from '../adapters';

function detectAdapter(): PlatformAdapter {
  const host = window.location.hostname;
  if (host === 'mail.google.com') return new GmailAdapter();
  if (host === 'www.linkedin.com') return new LinkedInAdapter();
  if (host === 'x.com' || host === 'twitter.com') return new TwitterAdapter();
  if (host.endsWith('.slack.com') || host === 'app.slack.com') return new SlackAdapter();
  if (host === 'discord.com') return new DiscordAdapter();
  if (host === 'outlook.live.com' || host === 'outlook.office.com') return new OutlookAdapter();
  if (host === 'teams.microsoft.com') return new TeamsAdapter();
  if (host === 'web.whatsapp.com') return new WhatsAppAdapter();
  return new GenericFallbackAdapter();
}

async function sendMessage(msg: MessageToBackground): Promise<MessageFromBackground> {
  return chrome.runtime.sendMessage(msg);
}

/** Create a big warning banner that's impossible to miss */
function createWarningBanner(): {
  element: HTMLElement;
  show: (text: string) => void;
  showAnalysis: (result: AnalysisResult, originalText: string) => void;
  hide: () => void;
} {
  const banner = document.createElement('div');
  banner.id = 'reword-warning-banner';
  banner.style.cssText = `
    position: fixed; bottom: 60px; left: 0; right: 0; z-index: 999999;
    background: #1e40af; color: white; padding: 16px 24px;
    font-family: system-ui, -apple-system, sans-serif; font-size: 15px;
    display: none; box-shadow: 0 -4px 20px rgba(0,0,0,0.3);
    transition: transform 0.3s ease;
  `;

  const content = document.createElement('div');
  content.style.cssText = 'max-width: 800px; margin: 0 auto;';
  banner.appendChild(content);
  document.body.appendChild(banner);

  return {
    element: banner,
    show(_text: string) {
      content.innerHTML = `
        <style>
          @keyframes reword-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
          @keyframes reword-spin { to { transform: rotate(360deg); } }
          .reword-spinner {
            display: inline-block; width: 16px; height: 16px;
            border: 2px solid rgba(255,255,255,0.3);
            border-top-color: white; border-radius: 50%;
            animation: reword-spin 0.8s linear infinite;
            vertical-align: middle; margin-right: 8px;
          }
          .reword-checking { animation: reword-pulse 1.5s ease-in-out infinite; }
          .reword-diff-added { background: rgba(34,197,94,0.2); color: #166534; padding: 1px 3px; border-radius: 3px; }
          .reword-diff-removed { text-decoration: line-through; opacity: 0.5; color: #991b1b; padding: 1px 3px; }
        </style>
        <div style="display:flex;align-items:center;gap:12px;">
          <span style="font-size:24px;">⚠️</span>
          <div style="flex:1;" class="reword-checking">
            <span class="reword-spinner"></span>
            <strong>Reword:</strong> Harsh tone detected — analyzing for kinder alternatives...
          </div>
          <button id="reword-dismiss" style="background:rgba(255,255,255,0.2);border:none;color:white;padding:6px 16px;border-radius:4px;cursor:pointer;font-size:14px;">Dismiss</button>
        </div>`;
      banner.style.display = 'block';
      document.getElementById('reword-dismiss')?.addEventListener('click', () => {
        banner.style.display = 'none';
      });
    },
    showAnalysis(result: AnalysisResult, originalText: string) {
      const issueList = result.issues.map((i) => `<li>${i}</li>`).join('');
      const rewriteButtons = result.rewrites
        .map(
          (r, i) => `
        <button class="reword-use-rewrite" data-index="${i}"
          style="background:white;color:#333;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:14px;text-align:left;margin:4px 0;width:100%;">
          <strong>${r.tone}:</strong> ${renderDiffHTML(originalText, r.text)}
        </button>`,
        )
        .join('');

      content.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:12px;">
          <span style="font-size:24px;">⚠️</span>
          <div style="flex:1;">
            <div style="margin-bottom:8px;">
              <strong>Tone issue detected:</strong> ${result.explanation || issueList}
            </div>
            ${
              result.rewrites.length > 0
                ? `
              <div style="margin-bottom:8px;font-size:13px;opacity:0.9;">Click a rewrite to replace your message:</div>
              <div>${rewriteButtons}</div>
            `
                : ''
            }
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            <button id="reword-send-anyway" style="background:rgba(255,255,255,0.2);border:none;color:white;padding:6px 16px;border-radius:4px;cursor:pointer;font-size:13px;">Send anyway</button>
            <button id="reword-dismiss2" style="background:rgba(255,255,255,0.2);border:none;color:white;padding:6px 16px;border-radius:4px;cursor:pointer;font-size:13px;">Edit message</button>
          </div>
        </div>`;
      banner.style.display = 'block';

      document.getElementById('reword-send-anyway')?.addEventListener('click', () => {
        banner.style.display = 'none';
      });
      document.getElementById('reword-dismiss2')?.addEventListener('click', () => {
        banner.style.display = 'none';
      });
    },
    hide() {
      banner.style.display = 'none';
    },
  };
}

function init(): void {
  console.log('[Reword] init on', window.location.hostname);
  const adapter = detectAdapter();

  let currentResult: AnalysisResult | null = null;
  let currentText = '';
  let analyzing = false;
  let cachedInput: HTMLElement | null = null;

  const banner = createWarningBanner();

  // Shared handler for accepting a rewrite from any source (popup card or banner button)
  function acceptRewrite(rewriteText: string): void {
    adapter.writeBack(rewriteText);
    banner.hide();
    window.postMessage({ type: 'reword-unblock' }, '*');
    if (cachedInput) cachedInput.dispatchEvent(new Event('input', { bubbles: true }));
    sendMessage({ type: 'increment-stat', stat: 'rewritesAccepted' });
  }

  const popup = new PopupCard({
    onRewrite: (text) => {
      acceptRewrite(text);
    },
    onDismiss: () => {
      banner.hide();
      if (currentText) {
        sendMessage({
          type: 'record-dismiss',
          textSnippet: normalizeSnippet(currentText),
          categories: currentResult?.issues ?? [],
        });
      }
    },
    onSuppress: (text) => sendMessage({ type: 'suppress-phrase', text }),
  });

  // Load theme
  sendMessage({ type: 'get-settings' }).then((resp) => {
    if (resp.type === 'settings') popup.setTheme(resp.data.settings.theme);
  });

  function getTextFrom(el: HTMLElement): string {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el.value.trim();
    return el.textContent?.trim() ?? '';
  }

  // Analyze message and show banner
  async function analyzeMessage(text: string): Promise<void> {
    if (analyzing) return;
    analyzing = true;
    currentText = text;

    // Show warning immediately
    banner.show(text);

    try {
      const response = await sendMessage({
        type: 'analyze',
        text,
        context: adapter.scrapeThreadContext(),
        relationshipType: 'workplace',
        sensitivity: 'medium',
      });

      if (response.type === 'analysis-result' && response.result.shouldFlag) {
        currentResult = response.result;
        banner.showAnalysis(response.result, text);

        // Wire up rewrite buttons
        document.querySelectorAll('.reword-use-rewrite').forEach((btn) => {
          btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-index') ?? '0');
            const rewrite = response.result.rewrites[idx];
            if (rewrite) acceptRewrite(rewrite.text);
          });
        });

        sendMessage({
          type: 'record-flag',
          event: {
            date: new Date().toISOString(),
            platform: adapter.platformName,
            riskLevel: response.result.riskLevel,
            issues: response.result.issues,
            textSnippet: text.slice(0, 80),
          },
        });
      } else {
        banner.hide();
        currentResult = null;
      }
    } catch (err) {
      console.warn('[Reword] analysis error:', err);
      banner.hide();
    }
    analyzing = false;
  }

  // Watch input with debounced analysis
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  function onInputChange(): void {
    if (!cachedInput) return;
    const text = getTextFrom(cachedInput);

    if (debounceTimer) clearTimeout(debounceTimer);

    if (text.length < MIN_MESSAGE_LENGTH) {
      banner.hide();
      return;
    }

    // Quick heuristic check — show warning INSTANTLY if harsh
    const score = scoreMessage(text);
    if (score < HEURISTIC_THRESHOLD) {
      banner.hide();
      return;
    }

    // Show warning immediately — don't wait for AI
    banner.show(text);
    console.log('[Reword] flagged, score:', score.toFixed(2), 'text:', text.slice(0, 50));

    // Debounce the full AI analysis for detailed rewrites
    debounceTimer = setTimeout(() => {
      analyzeMessage(text);
    }, AI_DEBOUNCE_MS);
  }

  // Attach input listener to the cached element (clean up old listeners to prevent leaks)
  function attachInputListener(el: HTMLElement): void {
    if (el === cachedInput) return;
    if (cachedInput) {
      cachedInput.removeEventListener('input', onInputChange);
      cachedInput.removeEventListener('keyup', onInputChange);
    }
    cachedInput = el;
    console.log('[Reword] watching input:', el.className.slice(0, 60));
    el.addEventListener('input', onInputChange);
    el.addEventListener('keyup', onInputChange);
  }

  // Poll for input field
  setInterval(() => {
    const input =
      adapter.findInputField() ??
      document.querySelector<HTMLElement>('[contenteditable="true"][role="textbox"]') ??
      document.querySelector<HTMLElement>('[contenteditable="true"]');
    if (input && input !== cachedInput) {
      attachInputListener(input);
    }
  }, 2000);

  // Also detect via focus
  document.addEventListener(
    'focusin',
    (e) => {
      const t = e.target as HTMLElement;
      if (
        t?.isContentEditable ||
        t?.getAttribute?.('contenteditable') === 'true' ||
        t?.getAttribute?.('role') === 'textbox'
      ) {
        attachInputListener(t);
      }
    },
    true,
  );

  // Listen for blocked Enter from shadow-pierce.js (MAIN world)
  window.addEventListener('message', (e) => {
    if (e.data?.type !== 'reword-send-intercept') return;
    const text = e.data.text ?? '';
    if (text.length < MIN_MESSAGE_LENGTH) return;
    console.log('[Reword] send intercepted via shadow-pierce:', text.slice(0, 50));
    analyzeMessage(text);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
