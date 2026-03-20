import type {
  AnalysisOptions,
  ContactProfile,
  RelationshipType,
  RewritePersona,
  Sensitivity,
  ThreadMessage,
} from './types';

const HARSH_KEYWORDS = [
  'ridiculous',
  'useless',
  'stupid',
  'incompetent',
  'pathetic',
  'absurd',
  'terrible',
  'horrible',
  'awful',
  'idiotic',
  'moronic',
  'garbage',
  'trash',
  'worthless',
  'joke',
  'crap',
  'damn',
  'hell',
  'bullshit',
  'shit',
];

export function detectEscalation(threadContext: ThreadMessage[]): {
  isEscalating: boolean;
  signals: string[];
} {
  const signals: string[] = [];

  if (threadContext.length === 0) {
    return { isEscalating: false, signals };
  }

  // Signal 1: Multiple self messages with harsh keywords
  const selfMessages = threadContext.filter((m) => m.sender === 'self');
  const harshSelfMessages = selfMessages.filter((m) => {
    const lower = m.text.toLowerCase();
    return HARSH_KEYWORDS.some((kw) => lower.includes(kw));
  });
  if (harshSelfMessages.length >= 2) {
    signals.push('Multiple harsh messages detected in this conversation');
  }

  // Signal 2: Increasing message length (frustration = longer messages)
  if (selfMessages.length >= 3) {
    const lengths = selfMessages.map((m) => m.text.length);
    let increasing = true;
    for (let i = 1; i < lengths.length; i++) {
      if (lengths[i] <= lengths[i - 1]) {
        increasing = false;
        break;
      }
    }
    if (increasing) {
      signals.push('Messages are getting progressively longer, suggesting frustration');
    }
  }

  // Signal 3: Excessive caps or punctuation in recent messages
  const recentSelf = selfMessages.slice(-3);
  const hasExcessiveCapsOrPunctuation = recentSelf.some((m) => {
    const text = m.text;
    if (text.length < 5) return false;
    const upperCount = (text.match(/[A-Z]/g) || []).length;
    const letterCount = (text.match(/[A-Za-z]/g) || []).length;
    const capsRatio = letterCount > 0 ? upperCount / letterCount : 0;
    const excessivePunctuation = /[!?]{3,}/.test(text);
    return capsRatio > 0.5 || excessivePunctuation;
  });
  if (hasExcessiveCapsOrPunctuation) {
    signals.push('Excessive capitalization or punctuation detected in recent messages');
  }

  // Signal 4: Rapid-fire back-and-forth (4+ alternating messages)
  if (threadContext.length >= 4) {
    let alternatingCount = 1;
    let maxAlternating = 1;
    for (let i = 1; i < threadContext.length; i++) {
      if (threadContext[i].sender !== threadContext[i - 1].sender) {
        alternatingCount++;
        maxAlternating = Math.max(maxAlternating, alternatingCount);
      } else {
        alternatingCount = 1;
      }
    }
    if (maxAlternating >= 4) {
      signals.push('Rapid back-and-forth exchange detected, suggesting heated discussion');
    }
  }

  return { isEscalating: signals.length > 0, signals };
}

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

function buildContactProfileBlock(contactProfile?: ContactProfile): string {
  if (!contactProfile) return '';
  const parts: string[] = [];
  if (contactProfile.toneGoal) {
    parts.push(`Tone goal for this recipient: ${contactProfile.toneGoal}`);
  }
  if (contactProfile.culturalContext) {
    parts.push(`Cultural context: ${contactProfile.culturalContext}`);
  }
  if (parts.length === 0) return '';
  return `\n\nRecipient profile for ${contactProfile.displayName}:\n${parts.join('\n')}`;
}

function buildLanguageBlock(preferredLanguage?: string): string {
  if (!preferredLanguage) {
    return '\n\nDetect the language of the draft message and write all rewrites in that same language.';
  }
  return `\n\nWrite all rewrites in ${preferredLanguage}.`;
}

export function buildAnalysisPrompt(
  message: string,
  relationshipType: RelationshipType,
  sensitivity: Sensitivity,
  threadContext: ThreadMessage[],
  options?: AnalysisOptions,
): string {
  const contextBlock = formatThreadContext(threadContext);
  const personaBlock = buildPersonaInstructions(options?.personas ?? []);
  const contactBlock = buildContactProfileBlock(options?.contactProfile);
  const languageBlock = buildLanguageBlock(options?.preferredLanguage);
  const escalation = detectEscalation(threadContext);

  let escalationBlock = '';
  if (escalation.isEscalating) {
    escalationBlock = `\n\nESCALATION DETECTED in this conversation thread. Signals: ${escalation.signals.join('; ')}
When generating rewrites:
- Include a "De-escalate" rewrite option that acknowledges the other person's perspective
- The de-escalation rewrite should: lower the emotional temperature, validate the other person's concerns, and redirect toward a solution
- Avoid dismissive language like "calm down" — instead use "I understand this is frustrating"
- Prioritize the de-escalation rewrite as the first option`;
  }

  const rewriteCount = options?.personas?.length || 3;
  const rewriteInstruction =
    options?.personas && options.personas.length > 0
      ? `If you flag a message, provide exactly ${rewriteCount} rewrites using the custom styles above`
      : 'If you flag a message, provide exactly 3 rewrites at different intensity levels';

  return `You are Reword, an AI that helps people communicate better. Analyze the following draft message and decide if it should be flagged for tone issues.

${RELATIONSHIP_INSTRUCTIONS[relationshipType]}

Sensitivity: ${SENSITIVITY_INSTRUCTIONS[sensitivity]}
${languageBlock}${contactBlock}
Rules:
- Do NOT flag short affirmative messages (ok, sounds good, thanks, etc.)
- Do NOT flag factual/logistical messages (meeting at 3, see attached, etc.)
- Do NOT flag messages that are already warm and clear
- ${rewriteInstruction}
${personaBlock}${contextBlock}${escalationBlock}

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
