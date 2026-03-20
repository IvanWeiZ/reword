import Anthropic from '@anthropic-ai/sdk';
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

const MODEL = 'claude-sonnet-4-20250514';

export class ClaudeProvider implements AIProvider {
  name: ProviderName = 'claude';
  private client: Anthropic | null = null;

  configure(apiKey: string): void {
    this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
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
    if (!this.client) throw new Error('Claude client not configured');

    const prompt = buildAnalysisPrompt(message, relationshipType, sensitivity, threadContext, {
      personas: options?.personas,
      contactProfile: options?.contactProfile,
      preferredLanguage: options?.preferredLanguage,
    });

    const stream = await this.client.messages.stream({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    let fullText = '';
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullText += event.delta.text;
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
    if (!this.client) throw new Error('Claude client not configured');

    const prompt = buildIncomingAnalysisPrompt(message, threadContext);
    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    const text = textBlock && textBlock.type === 'text' ? textBlock.text : '';
    return parseIncomingAnalysisResponse(text);
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const testClient = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
      await testClient.messages.create({
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
