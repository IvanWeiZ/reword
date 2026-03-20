import OpenAI from 'openai';
import type {
  AIProvider,
  AnalysisOptions,
  AnalysisResult,
  IncomingAnalysis,
  ProviderName,
  RelationshipType,
  Sensitivity,
  StreamCallback,
  ThreadMessage,
} from '../../shared/types';
import { buildAnalysisPrompt, buildIncomingAnalysisPrompt } from '../../shared/prompts';
import { parseAnalysisResponse, parseIncomingAnalysisResponse } from '../response-parsers';

const MODEL = 'gpt-4o';

export class OpenAIProvider implements AIProvider {
  name: ProviderName = 'openai';
  private client: OpenAI | null = null;

  configure(apiKey: string): void {
    this.client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async analyzeStreaming(
    message: string,
    relationshipType: RelationshipType,
    sensitivity: Sensitivity,
    threadContext: ThreadMessage[],
    onStream: StreamCallback,
    _signal?: AbortSignal,
    options?: AnalysisOptions,
  ): Promise<AnalysisResult> {
    if (!this.client) throw new Error('OpenAI client not configured');

    const prompt = buildAnalysisPrompt(
      message,
      relationshipType,
      sensitivity,
      threadContext,
      options,
    );

    const stream = await this.client.chat.completions.create({
      model: MODEL,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    });

    let fullText = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      if (delta) {
        fullText += delta;
        onStream(fullText);
      }
    }

    return parseAnalysisResponse(fullText);
  }

  async analyze(
    message: string,
    relationshipType: RelationshipType,
    sensitivity: Sensitivity,
    threadContext: ThreadMessage[],
    options?: AnalysisOptions,
  ): Promise<AnalysisResult> {
    return this.analyzeStreaming(
      message,
      relationshipType,
      sensitivity,
      threadContext,
      () => {},
      undefined,
      options,
    );
  }

  async analyzeIncoming(
    message: string,
    threadContext: ThreadMessage[],
  ): Promise<IncomingAnalysis> {
    if (!this.client) throw new Error('OpenAI client not configured');

    const prompt = buildIncomingAnalysisPrompt(message, threadContext);
    const response = await this.client.chat.completions.create({
      model: MODEL,
      stream: false,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.choices[0]?.message?.content ?? '';
    return parseIncomingAnalysisResponse(text);
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const testClient = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
      await testClient.chat.completions.create({
        model: MODEL,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Say "ok"' }],
      });
      return true;
    } catch (error) {
      console.warn('[Reword] API key validation failed:', error);
      return false;
    }
  }
}
