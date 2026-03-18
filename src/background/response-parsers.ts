import type { AnalysisResult, IncomingAnalysis } from '../shared/types';

/** Parse the JSON response from Gemini for outgoing message analysis. */
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

/** Parse the JSON response from Gemini for incoming message analysis. */
export function parseIncomingAnalysisResponse(text: string): IncomingAnalysis {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse incoming analysis response: ${cleaned.slice(0, 100)}`);
  }

  return {
    riskLevel: (['low', 'medium', 'high'].includes(parsed.risk_level as string)
      ? parsed.risk_level
      : 'low') as IncomingAnalysis['riskLevel'],
    issues: Array.isArray(parsed.issues) ? (parsed.issues as string[]) : [],
    interpretation:
      typeof parsed.interpretation === 'string'
        ? (parsed.interpretation as string)
        : 'Unable to interpret this message.',
  };
}
