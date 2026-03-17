import type { RelationshipType, Sensitivity, ThreadMessage } from './types';

const RELATIONSHIP_INSTRUCTIONS: Record<RelationshipType, string> = {
  romantic: `You are analyzing a message in a romantic relationship context.
Flag: sarcasm, emotional dismissal, bringing up past arguments, passive-aggression, coldness.
Rewrites should add empathy, validation, and warmth while preserving the sender's actual point.`,

  workplace: `You are analyzing a message in a professional workplace context.
Flag: passive-aggression, overly casual tone to superiors, unclear requests, blame-shifting, condescension.
Rewrites should professionalize tone, clarify intent, and maintain respect while preserving the sender's actual point.`,

  family: `You are analyzing a message in a family relationship context.
Flag: guilt-tripping, generational tension patterns, dismissiveness, controlling language, emotional manipulation.
Rewrites should de-escalate, validate feelings, and set boundaries kindly while preserving the sender's actual point.`,
};

const SENSITIVITY_INSTRUCTIONS: Record<Sensitivity, string> = {
  low: 'Only flag messages that are clearly hostile, insulting, or very likely to cause a fight. Borderline cases should pass.',
  medium:
    'Flag messages that could reasonably be misread or that contain subtle negative tone. Use your best judgment.',
  high: 'Flag anything that could possibly be taken the wrong way, even if the intent seems harmless. Better safe than sorry.',
};

export function buildAnalysisPrompt(
  message: string,
  relationshipType: RelationshipType,
  sensitivity: Sensitivity,
  threadContext: ThreadMessage[],
): string {
  const contextBlock =
    threadContext.length > 0
      ? `\n\nRecent conversation for context:\n${threadContext.map((m) => `[${m.sender}]: ${m.text}`).join('\n')}`
      : '';

  return `You are Reword, an AI that helps people communicate better. Analyze the following draft message and decide if it should be flagged for tone issues.

${RELATIONSHIP_INSTRUCTIONS[relationshipType]}

Sensitivity: ${SENSITIVITY_INSTRUCTIONS[sensitivity]}

Rules:
- Do NOT flag short affirmative messages (ok, sounds good, thanks, etc.)
- Do NOT flag factual/logistical messages (meeting at 3, see attached, etc.)
- Do NOT flag messages that are already warm and clear
- If you flag a message, provide exactly 3 rewrites at different intensity levels
${contextBlock}

Draft message to analyze:
"${message}"

Respond with ONLY valid JSON in this exact format:
{
  "should_flag": true/false,
  "risk_level": "low" | "medium" | "high",
  "issues": ["issue1", "issue2"],
  "explanation": "One sentence explaining why this was flagged",
  "rewrites": [
    {"label": "Warmer", "text": "..."},
    {"label": "Direct but kind", "text": "..."},
    {"label": "Minimal change", "text": "..."}
  ]
}

If should_flag is false, set risk_level to "low", issues to [], explanation to "", and rewrites to [].`;
}
