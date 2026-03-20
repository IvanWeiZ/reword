import type { AnalysisResult, Theme, ContactProfile } from '../shared/types';
import type { ConversationHealthTracker } from './conversation-health';
import { detectPlatformDarkMode } from './dark-mode-detect';
import { renderDiffHTML, escapeHTML } from './helpers';
import { CooldownTracker } from './cooldown';

interface PopupCardOptions {
  onRewrite: (text: string) => void;
  onDismiss: () => void;
  onUndo?: () => void;
  onSuppress?: (text: string) => void;
}

const RISK_COLORS = {
  low: '#90caf9',
  medium: '#f0a030',
  high: '#ef5350',
};

const RISK_LABELS: Record<string, string> = {
  low: 'Subtle',
  medium: 'Moderate',
  high: 'Strong',
};

export class PopupCard {
  element: HTMLElement;
  private options: PopupCardOptions;
  private theme: Theme = 'auto';
  private lastOriginalText = '';
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private currentResult: AnalysisResult | null = null;
  private streamingEl: HTMLElement | null = null;
  private cooldownTracker = new CooldownTracker();
  private cooldownDismissed = false;
  private healthTracker: ConversationHealthTracker | null = null;
  private currentThreadId: string | null = null;
  recipientId: string | null = null;
  private savedContactIds: Set<string> = new Set();

  constructor(options: PopupCardOptions) {
    this.options = options;
    this.element = document.createElement('div');
    this.element.className = 'reword-card';
    this.element.style.display = 'none';
    this.injectStyles();
  }

  setHealthTracker(tracker: ConversationHealthTracker, threadId: string): void {
    this.healthTracker = tracker;
    this.currentThreadId = threadId;
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    this.updateThemeStyles();
  }

  isDark(): boolean {
    if (this.theme === 'dark') return true;
    if (this.theme === 'light') return false;
    // Check platform-specific dark mode before falling back to OS preference
    if (detectPlatformDarkMode()) return true;
    return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? true;
  }

  private injectStyles(): void {
    if (document.getElementById('reword-popup-styles')) return;
    const style = document.createElement('style');
    style.id = 'reword-popup-styles';
    style.textContent = this.buildCSS();
    document.head.appendChild(style);
  }

  private updateThemeStyles(): void {
    const style = document.getElementById('reword-popup-styles');
    if (style) style.textContent = this.buildCSS();
  }

  private buildCSS(): string {
    const dark = this.isDark();
    const bg = dark ? '#1e1e2e' : '#ffffff';
    const text = dark ? '#e0e0e0' : '#1a1a2e';
    const cardBg = dark ? '#2a2a3e' : '#f5f5f5';
    const border = dark ? '#444' : '#ddd';
    const muted = dark ? '#aaa' : '#666';
    const mutedBg = dark ? '#333' : '#e0e0e0';
    const shadow = dark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.15)';

    return `
      .reword-card { position: fixed; width: 400px; max-height: 80vh; overflow-y: auto; background: ${bg}; color: ${text}; border-radius: 12px; box-shadow: 0 8px 32px ${shadow}; padding: 20px; z-index: 99999; font-size: 14px; line-height: 1.5; font-family: system-ui, -apple-system, sans-serif; }
      .reword-risk-indicator { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; font-size: 13px; font-weight: 600; }
      .reword-risk-dot { width: 10px; height: 10px; border-radius: 50%; }
      .reword-original { background: ${cardBg}; padding: 12px; border-radius: 6px; margin-bottom: 16px; border-left: 3px solid ${muted}; }
      .reword-original-label { font-size: 11px; color: ${muted}; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
      .reword-explanation { font-size: 13px; color: ${muted}; margin-bottom: 16px; }
      .reword-details { margin-bottom: 16px; }
      .reword-details-toggle { font-size: 12px; color: ${muted}; cursor: pointer; background: none; border: none; padding: 0; text-decoration: underline; }
      .reword-details-content { display: none; margin-top: 8px; font-size: 13px; color: ${muted}; background: ${cardBg}; padding: 10px; border-radius: 6px; }
      .reword-details-content.reword-expanded { display: block; }
      .reword-rewrites { display: flex; flex-direction: column; gap: 10px; }
      .reword-rewrite-option { background: ${cardBg}; padding: 12px; border-radius: 6px; border: 1px solid ${border}; cursor: pointer; position: relative; }
      .reword-rewrite-option:hover { border-color: #6366f1; }
      .reword-rewrite-label { font-size: 11px; font-weight: 600; margin-bottom: 4px; color: ${muted}; }
      .reword-rewrite-shortcut { position: absolute; top: 8px; right: 10px; font-size: 10px; color: ${muted}; opacity: 0.6; }
      .reword-actions { display: flex; gap: 10px; margin-top: 16px; justify-content: flex-end; }
      .reword-send-original { padding: 8px 16px; border-radius: 6px; font-size: 13px; cursor: pointer; background: ${cardBg}; border: 1px solid ${border}; color: ${text}; }
      .reword-send-original:hover { border-color: #6366f1; }
      .reword-cancel { padding: 8px 16px; border-radius: 6px; font-size: 13px; cursor: pointer; background: none; border: none; color: ${muted}; }
      .reword-undo-toast { position: fixed; bottom: 24px; right: 24px; background: ${cardBg}; color: ${text}; padding: 10px 16px; border-radius: 8px; box-shadow: 0 4px 16px ${shadow}; z-index: 100000; display: flex; gap: 12px; align-items: center; font-size: 13px; font-family: system-ui; }
      .reword-undo-btn { background: #6366f1; color: white; border: none; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; }
      .reword-shortcut-hint { font-size: 11px; color: ${muted}; text-align: center; margin-top: 8px; opacity: 0.7; }
      .reword-streaming-indicator { color: ${muted}; font-size: 13px; padding: 12px; text-align: center; }
      .reword-incoming-indicator { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 2px 6px; border-radius: 4px; cursor: pointer; font-family: system-ui; }
      .reword-incoming-tooltip { position: absolute; background: ${bg}; color: ${text}; padding: 12px; border-radius: 8px; box-shadow: 0 4px 16px ${shadow}; z-index: 99998; max-width: 300px; font-size: 13px; font-family: system-ui; }
      .reword-btn-muted { background: ${mutedBg}; color: ${text}; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; }
      .reword-diff-added { background: ${dark ? '#1b5e20' : '#e8f5e9'}; color: ${dark ? '#a5d6a7' : 'inherit'}; font-weight: bold; padding: 1px 3px; border-radius: 3px; }
      .reword-diff-removed { background: ${dark ? '#b71c1c' : '#ffebee'}; color: ${dark ? '#ef9a9a' : 'inherit'}; text-decoration: line-through; opacity: 0.7; padding: 1px 3px; border-radius: 3px; }
      .reword-rewrite-diff { line-height: 1.6; }
      .reword-cooldown-banner { background: #e0f2f1; color: #00695c; padding: 10px 14px; border-radius: 8px; margin-bottom: 14px; font-size: 13px; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; line-height: 1.4; }
      .reword-cooldown-banner button { background: #b2dfdb; color: #00695c; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; white-space: nowrap; flex-shrink: 0; }
      .reword-health-footer { margin-top: 12px; padding-top: 10px; border-top: 1px solid ${border}; font-size: 12px; }
      .reword-health-score { display: flex; align-items: center; gap: 6px; cursor: pointer; }
      .reword-health-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
      .reword-health-breakdown { display: none; margin-top: 6px; font-size: 11px; color: ${muted}; padding: 8px; background: ${cardBg}; border-radius: 6px; }
      .reword-health-breakdown.reword-expanded { display: block; }
      .reword-suppress-link { font-size: 11px; color: ${muted}; cursor: pointer; background: none; border: none; padding: 0; text-decoration: underline; display: block; text-align: center; margin-top: 6px; opacity: 0.7; }
      .reword-suppress-link:hover { opacity: 1; }
      .reword-save-profile-link { font-size: 11px; color: ${muted}; cursor: pointer; background: none; border: none; padding: 0; text-decoration: underline; display: block; text-align: center; margin-top: 4px; opacity: 0.7; }
      .reword-save-profile-link:hover { opacity: 1; }
      .reword-save-profile-form { margin-top: 12px; padding: 12px; background: ${cardBg}; border-radius: 6px; border: 1px solid ${border}; font-size: 13px; }
      .reword-save-profile-form label { display: block; font-size: 11px; color: ${muted}; margin-bottom: 2px; margin-top: 8px; }
      .reword-save-profile-form label:first-child { margin-top: 0; }
      .reword-save-profile-form input, .reword-save-profile-form select { width: 100%; box-sizing: border-box; padding: 6px 8px; border-radius: 4px; border: 1px solid ${border}; background: ${bg}; color: ${text}; font-size: 12px; }
      .reword-save-profile-form .reword-form-actions { display: flex; gap: 8px; margin-top: 10px; justify-content: flex-end; }
      .reword-save-profile-btn { padding: 6px 14px; border-radius: 4px; background: #6366f1; color: white; border: none; font-size: 12px; cursor: pointer; }
      .reword-save-profile-cancel { padding: 6px 14px; border-radius: 4px; background: none; border: 1px solid ${border}; color: ${muted}; font-size: 12px; cursor: pointer; }
    `;
  }

  show(result: AnalysisResult, originalText: string): void {
    this.currentResult = result;
    this.lastOriginalText = originalText;
    this.cooldownTracker.recordAnalysis();
    const dotColor = RISK_COLORS[result.riskLevel];

    const shouldShowCooldown =
      !this.cooldownDismissed && this.cooldownTracker.shouldSuggestCooldown();
    if (shouldShowCooldown) {
      this.cooldownTracker.markShown();
    }
    const cooldownBanner = shouldShowCooldown
      ? `<div class="reword-cooldown-banner">
            <span>You're on a roll — want to review your recent messages before continuing?</span>
            <button class="reword-cooldown-dismiss">Continue</button>
          </div>`
      : '';

    this.element.innerHTML = `
      ${cooldownBanner}
      <div class="reword-risk-indicator">
        <span class="reword-risk-dot" style="background:${dotColor}"></span>
        <span>${RISK_LABELS[result.riskLevel] ?? this.cap(result.riskLevel)} — This might read as ${escapeHTML(result.explanation)}. Here are some alternatives:</span>
      </div>
      <div class="reword-original">
        <div class="reword-original-label">Your message</div>
        <div>${escapeHTML(originalText)}</div>
      </div>
      ${this.buildDetailsSection(result)}
      <div class="reword-explanation">${escapeHTML(result.issues.join('. '))}</div>
      <div class="reword-rewrites">
        ${result.rewrites
          .map(
            (r, i) => `
          <div class="reword-rewrite-option" data-index="${i}">
            <div class="reword-rewrite-label">${escapeHTML(r.label)}</div>
            <div class="reword-rewrite-diff">${renderDiffHTML(originalText, r.text)}</div>
            <span class="reword-rewrite-shortcut">⌥${i + 1}</span>
          </div>
        `,
          )
          .join('')}
      </div>
      <div class="reword-shortcut-hint">Press ⌥1–${result.rewrites.length} to quick-accept · Enter to send original · Esc to close</div>
      <div class="reword-actions">
        <button class="reword-send-original">Keep original <span class="reword-rewrite-shortcut">Enter</span></button>
        <button class="reword-cancel">Cancel <span class="reword-rewrite-shortcut">Esc</span></button>
      </div>
      <button class="reword-suppress-link">Don't flag this again</button>
      ${this.buildSaveProfileSection()}
      ${this.buildHealthFooter()}
    `;

    this.bindCardEvents(result);
    this.bindKeyboardShortcuts(result);
    this.element.style.display = 'block';
  }

  showStreaming(): void {
    this.element.innerHTML = `
      <div class="reword-streaming-indicator">Analyzing your message…</div>
    `;
    this.streamingEl = this.element.querySelector('.reword-streaming-indicator');
    this.element.style.display = 'block';
  }

  updateStreaming(partialText: string): void {
    if (this.streamingEl) {
      this.streamingEl.textContent = partialText
        ? `Analyzing… ${partialText.slice(0, 50)}`
        : 'Analyzing your message…';
    }
  }

  hide(): void {
    this.element.style.display = 'none';
    this.streamingEl = null;
    this.removeKeyboardShortcuts();
  }

  /**
   * Position the popup card near a target element (e.g. the trigger badge or compose field).
   * Places the card above or below the element, aligned to its right edge.
   * Falls back to bottom-right corner if the target is not in the DOM.
   */
  positionNear(target: HTMLElement): void {
    const CARD_WIDTH = 400;
    const MARGIN = 8;

    // Fall back to fixed bottom-right if target is detached
    if (!document.body.contains(target)) {
      this.element.style.bottom = '80px';
      this.element.style.right = '24px';
      this.element.style.top = '';
      this.element.style.left = '';
      return;
    }

    const rect = target.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    // Measure the card height (temporarily show off-screen to measure)
    this.element.style.top = '-9999px';
    this.element.style.left = '-9999px';
    this.element.style.bottom = '';
    this.element.style.right = '';
    const prevDisplay = this.element.style.display;
    this.element.style.display = 'block';
    const cardH = this.element.offsetHeight;
    this.element.style.display = prevDisplay;

    // Vertical: prefer above the target, fall back to below
    let top: number;
    const spaceAbove = rect.top;
    const spaceBelow = viewportH - rect.bottom;

    if (spaceAbove >= cardH + MARGIN) {
      top = rect.top - cardH - MARGIN;
    } else if (spaceBelow >= cardH + MARGIN) {
      top = rect.bottom + MARGIN;
    } else {
      // Not enough space either way — place below and let it scroll
      top = rect.bottom + MARGIN;
    }

    // Horizontal: align right edge of card to right edge of target
    let left = rect.right - CARD_WIDTH;

    // If that overflows left, align to left edge instead
    if (left < MARGIN) {
      left = MARGIN;
    }

    // If card overflows right, clamp
    if (left + CARD_WIDTH > viewportW - MARGIN) {
      left = viewportW - CARD_WIDTH - MARGIN;
    }

    // Clamp top to stay in viewport
    if (top < MARGIN) {
      top = MARGIN;
    }
    if (top + cardH > viewportH - MARGIN) {
      top = viewportH - cardH - MARGIN;
    }

    this.element.style.top = `${top}px`;
    this.element.style.left = `${left}px`;
    this.element.style.bottom = '';
    this.element.style.right = '';
  }

  private buildHealthFooter(): string {
    if (!this.healthTracker || !this.currentThreadId) return '';
    if (!this.healthTracker.hasEnoughData(this.currentThreadId)) return '';

    const summary = this.healthTracker.getThreadSummary(this.currentThreadId);
    const score = summary.score;
    let color: string;
    if (score >= 80) color = '#4caf50';
    else if (score >= 50) color = '#ff9800';
    else color = '#ef5350';

    const issuesHtml =
      summary.topIssues.length > 0
        ? `<div style="margin-top:4px">Top issues: ${summary.topIssues.map((i) => escapeHTML(i)).join(', ')}</div>`
        : '';

    return `
      <div class="reword-health-footer">
        <div class="reword-health-score" title="Click to see breakdown">
          <span class="reword-health-dot" style="background:${color}"></span>
          <span>Thread health: ${score}/100</span>
        </div>
        <div class="reword-health-breakdown">
          <div>Analyzed: ${summary.totalAnalyzed} · Flagged: ${summary.totalFlagged} · Rewrites accepted: ${summary.rewritesAccepted}</div>
          ${issuesHtml}
        </div>
      </div>
    `;
  }

  markContactSaved(platformId: string): void {
    this.savedContactIds.add(platformId);
  }

  private buildSaveProfileSection(): string {
    if (!this.recipientId || this.savedContactIds.has(this.recipientId)) return '';

    // Derive a friendly display name from the platform ID
    // e.g. 'gmail:jane@example.com' → 'jane', 'linkedin:john-doe' → 'john-doe'
    const rawId = this.recipientId;
    const colonIdx = rawId.indexOf(':');
    const afterColon = colonIdx >= 0 ? rawId.slice(colonIdx + 1) : rawId;
    const atIdx = afterColon.indexOf('@');
    const defaultName = atIdx >= 0 ? afterColon.slice(0, atIdx) : afterColon;

    return `
      <button class="reword-save-profile-link">Save tone preferences for this contact</button>
      <div class="reword-save-profile-form" style="display:none">
        <label>Display Name</label>
        <input type="text" class="reword-profile-display-name" value="${escapeHTML(defaultName)}" placeholder="e.g. Jane">
        <label>Relationship Type</label>
        <select class="reword-profile-relationship">
          <option value="workplace" selected>Workplace</option>
          <option value="romantic">Romantic</option>
          <option value="family">Family</option>
        </select>
        <label>Sensitivity</label>
        <select class="reword-profile-sensitivity">
          <option value="low">Low</option>
          <option value="medium" selected>Medium</option>
          <option value="high">High</option>
        </select>
        <label>Tone Goal</label>
        <input type="text" class="reword-profile-tone-goal" placeholder="e.g. more formal, match their energy">
        <label>Cultural Context</label>
        <input type="text" class="reword-profile-cultural-context" placeholder="e.g. prefers direct communication">
        <div class="reword-form-actions">
          <button class="reword-save-profile-cancel">Cancel</button>
          <button class="reword-save-profile-btn">Save</button>
        </div>
      </div>
    `;
  }

  private buildDetailsSection(result: AnalysisResult): string {
    if (result.issues.length === 0) return '';
    const issuesList = result.issues.map((issue) => `<li>${escapeHTML(issue)}</li>`).join('');
    return `
      <div class="reword-details">
        <button class="reword-details-toggle">Why was this flagged?</button>
        <div class="reword-details-content">
          <ul style="margin:0;padding-left:16px">${issuesList}</ul>
          <p style="margin-top:8px">${escapeHTML(result.explanation)}</p>
        </div>
      </div>
    `;
  }

  private bindCardEvents(result: AnalysisResult): void {
    // Rewrite options
    this.element.querySelectorAll<HTMLElement>('.reword-rewrite-option').forEach((el) => {
      el.addEventListener('click', () => {
        const i = parseInt(el.dataset.index ?? '0', 10);
        this.acceptRewrite(result.rewrites[i].text);
      });
    });

    // Send original
    this.element.querySelector('.reword-send-original')?.addEventListener('click', () => {
      this.options.onDismiss();
      this.hide();
    });

    // Cancel
    this.element.querySelector('.reword-cancel')?.addEventListener('click', () => {
      this.hide();
    });

    // Cooldown dismiss
    this.element.querySelector('.reword-cooldown-dismiss')?.addEventListener('click', () => {
      this.cooldownDismissed = true;
      this.element.querySelector('.reword-cooldown-banner')?.remove();
    });

    // "Why was this flagged?" toggle
    this.element.querySelector('.reword-details-toggle')?.addEventListener('click', () => {
      const content = this.element.querySelector('.reword-details-content');
      content?.classList.toggle('reword-expanded');
    });

    // "Don't flag this again" suppress link
    this.element.querySelector('.reword-suppress-link')?.addEventListener('click', () => {
      if (this.lastOriginalText) {
        this.options.onSuppress?.(this.lastOriginalText);
      }
      this.hide();
    });

    // Health score expand/collapse
    this.element.querySelector('.reword-health-score')?.addEventListener('click', () => {
      const breakdown = this.element.querySelector('.reword-health-breakdown');
      breakdown?.classList.toggle('reword-expanded');
    });

    // Save profile link — show/hide inline form
    const saveProfileLink = this.element.querySelector<HTMLElement>('.reword-save-profile-link');
    const saveProfileForm = this.element.querySelector<HTMLElement>('.reword-save-profile-form');
    if (saveProfileLink && saveProfileForm) {
      saveProfileLink.addEventListener('click', () => {
        saveProfileForm.style.display = 'block';
        saveProfileLink.style.display = 'none';
      });

      this.element.querySelector('.reword-save-profile-cancel')?.addEventListener('click', () => {
        saveProfileForm.style.display = 'none';
        saveProfileLink.style.display = 'block';
      });

      this.element
        .querySelector('.reword-save-profile-btn')
        ?.addEventListener('click', async () => {
          const platformId = this.recipientId!;
          const displayName =
            this.element
              .querySelector<HTMLInputElement>('.reword-profile-display-name')
              ?.value.trim() || platformId;
          const relationshipType = (this.element.querySelector<HTMLSelectElement>(
            '.reword-profile-relationship',
          )?.value ?? 'workplace') as ContactProfile['relationshipType'];
          const sensitivity = (this.element.querySelector<HTMLSelectElement>(
            '.reword-profile-sensitivity',
          )?.value ?? 'medium') as ContactProfile['sensitivity'];
          const toneGoal =
            this.element
              .querySelector<HTMLInputElement>('.reword-profile-tone-goal')
              ?.value.trim() ?? '';
          const culturalContext =
            this.element
              .querySelector<HTMLInputElement>('.reword-profile-cultural-context')
              ?.value.trim() ?? '';

          const profile: ContactProfile = {
            displayName,
            platformId,
            relationshipType,
            sensitivity,
            toneGoal,
            culturalContext,
            createdAt: new Date().toISOString(),
          };

          try {
            await chrome.runtime.sendMessage({ type: 'save-contact-profile', profile });
            this.savedContactIds.add(platformId);
            saveProfileForm.remove();
            saveProfileLink.remove();
          } catch (err) {
            console.warn('[Reword] Failed to save contact profile:', err);
          }
        });
    }
  }

  private bindKeyboardShortcuts(result: AnalysisResult): void {
    this.removeKeyboardShortcuts();
    this.keyHandler = (e: KeyboardEvent) => {
      if (this.element.style.display === 'none') return;

      // Escape closes popup
      if (e.key === 'Escape') {
        e.preventDefault();
        this.hide();
        return;
      }

      // Enter sends original (dismiss)
      if (e.key === 'Enter') {
        e.preventDefault();
        this.options.onDismiss();
        this.hide();
        return;
      }

      // Number keys 1-9 (plain or Alt+) for quick rewrite selection
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= result.rewrites.length) {
        e.preventDefault();
        this.acceptRewrite(result.rewrites[num - 1].text);
      }
    };
    document.addEventListener('keydown', this.keyHandler);
  }

  private removeKeyboardShortcuts(): void {
    if (this.keyHandler) {
      document.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
  }

  private acceptRewrite(text: string): void {
    this.options.onRewrite(text);
    this.hide();
    this.showUndoToast();
  }

  private showUndoToast(): void {
    const toast = document.createElement('div');
    toast.className = 'reword-undo-toast';
    toast.innerHTML = `
      <span>Rewrite applied</span>
      <button class="reword-undo-btn">Undo</button>
    `;
    toast.querySelector('.reword-undo-btn')?.addEventListener('click', () => {
      this.options.onUndo?.();
      toast.remove();
    });
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  private cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
