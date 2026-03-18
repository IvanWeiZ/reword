import type { RelationshipType, RewritePersona, Sensitivity, ThreadMessage } from './types';

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

function formatThreadContext(threadContext: ThreadMessage[]): string {
  if (threadContext.length === 0) return '';
  return `\n\nRecent conversation for context:\n${threadContext.map((m) => `[${m.sender}]: ${m.text}`).join('\n')}`;
}

function buildPersonaInstructions(personas: RewritePersona[]): string {
  if (personas.length === 0) return '';
  const list = personas.map((p) => `- "${p.label}": ${p.instruction}`).join('\n');
  return `\n\nCustom rewrite styles requested by the user. Use these INSTEAD of the default 3 rewrites:\n${list}`;
}

function buildRecipientStyleBlock(recipientStyle?: string): string {
  if (!recipientStyle) return '';
  return `\n\nThe recipient's communication style (based on their recent messages): ${recipientStyle}\nMatch your rewrites to a similar register and formality level.`;
}

export function buildAnalysisPrompt(
  message: string,
  relationshipType: RelationshipType,
  sensitivity: Sensitivity,
  threadContext: ThreadMessage[],
  options?: { personas?: RewritePersona[]; recipientStyle?: string },
): string {
  const contextBlock = formatThreadContext(threadContext);
  const personaBlock = buildPersonaInstructions(options?.personas ?? []);
  const recipientBlock = buildRecipientStyleBlock(options?.recipientStyle);

  const rewriteCount = options?.personas?.length || 3;
  const rewriteInstruction =
    options?.personas && options.personas.length > 0
      ? `If you flag a message, provide exactly ${rewriteCount} rewrites using the custom styles above`
      : 'If you flag a message, provide exactly 3 rewrites at different intensity levels';

  return `You are Reword, an AI that helps people communicate better. Analyze the following draft message and decide if it should be flagged for tone issues.

${RELATIONSHIP_INSTRUCTIONS[relationshipType]}

Sensitivity: ${SENSITIVITY_INSTRUCTIONS[sensitivity]}
${recipientBlock}
Rules:
- Do NOT flag short affirmative messages (ok, sounds good, thanks, etc.)
- Do NOT flag factual/logistical messages (meeting at 3, see attached, etc.)
- Do NOT flag messages that are already warm and clear
- ${rewriteInstruction}
${personaBlock}${contextBlock}

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

export function buildIncomingAnalysisPrompt(
  message: string,
  threadContext: ThreadMessage[],
): string {
  const contextBlock = formatThreadContext(threadContext);

  return `You are Reword, an AI that helps people understand incoming messages. Analyze the following received message for potential tone issues — passive-aggression, hostility, dismissiveness, manipulation, or hidden meaning.
${contextBlock}

Received message:
"${message}"

Respond with ONLY valid JSON in this exact format:
{
  "risk_level": "low" | "medium" | "high",
  "issues": ["issue1", "issue2"],
  "interpretation": "A neutral explanation of what this message likely means and how to read it charitably"
}

If the message is clearly benign, set risk_level to "low", issues to [], and interpretation to "This message appears straightforward and well-intentioned."`;
}
