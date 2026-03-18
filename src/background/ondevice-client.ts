interface OnDeviceResult {
  shouldFlag: boolean;
  confidence: number;
}

export class OnDeviceClient {
  private available: boolean | null = null;

  async isAvailable(): Promise<boolean> {
    if (this.available !== null) return this.available;
    try {
      this.available = typeof (globalThis as any).ai?.languageModel?.create === 'function';
    } catch (error) {
      console.warn('[Reword] On-device AI availability check failed:', error);
      this.available = false;
    }
    return this.available;
  }

  async checkTone(text: string): Promise<OnDeviceResult | null> {
    if (!(await this.isAvailable())) return null;

    try {
      const ai = (globalThis as any).ai;
      const session = await ai.languageModel.create({
        systemPrompt:
          'You analyze message tone. Respond with ONLY a JSON object: {"problematic": true/false, "confidence": 0.0-1.0}',
      });
      const response = await session.prompt(
        `Is this message potentially problematic in tone? "${text}"`,
      );
      session.destroy();

      const parsed = JSON.parse(response);
      return {
        shouldFlag: parsed.problematic === true,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      };
    } catch (error) {
      console.warn('[Reword] On-device AI tone check failed:', error);
      return null;
    }
  }
}
