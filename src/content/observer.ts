interface ObserverOptions {
  debounceMs: number;
  minLength: number;
  onAnalyze: (text: string) => void;
}

export class InputObserver {
  private options: ObserverOptions;
  private timer: ReturnType<typeof setTimeout> | null = null;
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
      if (this.timer) clearTimeout(this.timer);

      this.timer = setTimeout(() => {
        const text = this.getText();
        if (text.length < this.options.minLength) return;
        this.options.onAnalyze(text);
      }, this.options.debounceMs);
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
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
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
