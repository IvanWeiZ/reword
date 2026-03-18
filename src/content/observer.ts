interface ObserverOptions {
  debounceMs: number;
  aiDebounceMs: number;
  minLength: number;
  onHeuristic: (text: string) => void;
  onAiAnalyze: (text: string) => void;
}

export class InputObserver {
  private options: ObserverOptions;
  private heuristicTimer: ReturnType<typeof setTimeout> | null = null;
  private aiTimer: ReturnType<typeof setTimeout> | null = null;
  private element: HTMLElement | null = null;
  private handler: ((e: Event) => void) | null = null;
  generation = 0;

  constructor(options: ObserverOptions) {
    this.options = options;
  }

  observe(element: HTMLElement): void {
    this.disconnect();
    this.element = element;

    this.handler = () => {
      this.generation++;
      if (this.heuristicTimer) clearTimeout(this.heuristicTimer);
      if (this.aiTimer) clearTimeout(this.aiTimer);

      const text = this.getText();
      if (text.length < this.options.minLength) return;

      // Stage 1: fast heuristic after short debounce
      this.heuristicTimer = setTimeout(() => {
        this.options.onHeuristic(text);
      }, this.options.debounceMs);

      // Stage 2: AI analysis after longer debounce
      this.aiTimer = setTimeout(() => {
        this.options.onAiAnalyze(text);
      }, this.options.aiDebounceMs);
    };

    element.addEventListener('input', this.handler);
  }

  get currentElement(): HTMLElement | null {
    return this.element;
  }

  disconnect(): void {
    if (this.element && this.handler) {
      this.element.removeEventListener('input', this.handler);
    }
    if (this.heuristicTimer) clearTimeout(this.heuristicTimer);
    if (this.aiTimer) clearTimeout(this.aiTimer);
    this.heuristicTimer = null;
    this.aiTimer = null;
    this.element = null;
    this.handler = null;
  }

  getText(): string {
    if (!this.element) return '';
    if (this.element instanceof HTMLTextAreaElement || this.element instanceof HTMLInputElement) {
      return this.element.value;
    }
    return this.element.textContent?.trim() ?? '';
  }
}
