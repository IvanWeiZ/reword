import { GoogleGenerativeAI } from '@google/generative-ai';
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
import { API_TIMEOUT_MS } from '../../shared/constants';
import { parseAnalysisResponse, parseIncomingAnalysisResponse } from '../response-parsers';

export class GeminiProvider implements AIProvider {
  name: ProviderName = 'gemini';
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
    options?: AnalysisOptions,
  ): Promise<AnalysisResult> {
    if (!this.client) throw new Error('Gemini client not configured');

    const model = this.client.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const prompt = buildAnalysisPrompt(
      message,
      relationshipType,
      sensitivity,
      threadContext,
      options,
    );

    const streamResult = await model.generateContentStream({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), API_TIMEOUT_MS);

    // Forward caller's abort to our controller
    const onCallerAbort = () => timeoutController.abort();
    signal?.addEventListener('abort', onCallerAbort);

    let fullText = '';
    try {
      for await (const chunk of streamResult.stream) {
        if (timeoutController.signal.aborted) {
          throw signal?.aborted
            ? new DOMException('Aborted', 'AbortError')
            : new DOMException('API call timed out', 'TimeoutError');
        }
        const chunkText = chunk.text();
        fullText += chunkText;
        onStream(fullText);
      }
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onCallerAbort);
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
    if (!this.client) throw new Error('Gemini client not configured');

    const model = this.client.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const prompt = buildIncomingAnalysisPrompt(message, threadContext);
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const text = result.response.text();
    return parseIncomingAnalysisResponse(text);
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const testClient = new GoogleGenerativeAI(apiKey);
      const model = testClient.getGenerativeModel({ model: 'gemini-2.5-flash' });
      await model.generateContent('Say "ok"');
      return true;
    } catch (error) {
      console.warn('[Reword] API key validation failed:', error);
      return false;
    }
  }
}

// Re-export parsers for backwards compatibility
export { parseAnalysisResponse, parseIncomingAnalysisResponse } from '../response-parsers';
