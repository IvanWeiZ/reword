export const COOLDOWN_WINDOW_MS = 5 * 60 * 1000;
export const COOLDOWN_THRESHOLD = 3;

export class CooldownTracker {
  private timestamps: number[] = [];

  recordAnalysis(): void {
    const now = Date.now();
    this.timestamps.push(now);
    this.cleanup(now);
  }

  shouldSuggestCooldown(): boolean {
    const now = Date.now();
    this.cleanup(now);
    return this.timestamps.length >= COOLDOWN_THRESHOLD;
  }

  private cleanup(now: number): void {
    const cutoff = now - COOLDOWN_WINDOW_MS;
    this.timestamps = this.timestamps.filter((t) => t > cutoff);
  }
}
