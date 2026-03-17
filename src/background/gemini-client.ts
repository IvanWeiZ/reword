import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AnalysisResult, RelationshipType, Sensitivity, ThreadMessage } from '../shared/types';
import { buildAnalysisPrompt } from '../shared/prompts';

export type StreamCallback = (partialText: string) => void;

export class GeminiClient {
  private client: GoogleGenerativeAI | null = null;
  private apiKey: string = '';

  configure(apiKey: string): void {
    this.apiKey = apiKey;
    this.client = new GoogleGenerativeAI(apiKey);
  }

  isConfigured(): boolean {
    return this.client !== null && this.apiKey.length > 0;
  }

  async analyzeStreaming(
    message: string,
    relationshipType: RelationshipType,
    sensitivity: Sensitivity,
    threadContext: ThreadMessage[],
    onStream: StreamCallback,
    signal?: AbortSignal,
  ): Promise<AnalysisResult> {
    if (!this.client) throw new Error('Gemini client not configured');

    const model = this.client.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const prompt = buildAnalysisPrompt(message, relationshipType, sensitivity, threadContext);

    const streamResult = await model.generateContentStream({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    let fullText = '';
    for await (const chunk of streamResult.stream) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const chunkText = chunk.text();
      fullText += chunkText;
      onStream(fullText);
    }

    return parseAnalysisResponse(fullText);
  }

  async analyze(
    message: string,
    relationshipType: RelationshipType,
    sensitivity: Sensitivity,
    threadContext: ThreadMessage[],
    signal?: AbortSignal,
  ): Promise<AnalysisResult> {
    return this.analyzeStreaming(
      message,
      relationshipType,
      sensitivity,
      threadContext,
      () => {},
      signal,
    );
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const testClient = new GoogleGenerativeAI(apiKey);
      const model = testClient.getGenerativeModel({ model: 'gemini-2.5-flash' });
      await model.generateContent('Say "ok"');
      return true;
    } catch {
      return false;
    }
  }
}

export function parseAnalysisResponse(text: string): AnalysisResult {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse Gemini response as JSON: ${cleaned.slice(0, 100)}`);
  }

  if (typeof parsed.should_flag !== 'boolean') {
    throw new Error('Missing or invalid "should_flag" in response');
  }
  if (!['low', 'medium', 'high'].includes(parsed.risk_level as string)) {
    throw new Error('Missing or invalid "risk_level" in response');
  }
  if (!Array.isArray(parsed.issues)) {
    throw new Error('Missing or invalid "issues" in response');
  }
  if (typeof parsed.explanation !== 'string') {
    throw new Error('Missing or invalid "explanation" in response');
  }
  if (!Array.isArray(parsed.rewrites)) {
    throw new Error('Missing or invalid "rewrites" in response');
  }

  return {
    shouldFlag: parsed.should_flag as boolean,
    riskLevel: parsed.risk_level as AnalysisResult['riskLevel'],
    issues: parsed.issues as string[],
    explanation: parsed.explanation as string,
    rewrites: (parsed.rewrites as Array<{ label: string; text: string }>).map((r) => ({
      label: r.label,
      text: r.text,
    })),
  };
}
