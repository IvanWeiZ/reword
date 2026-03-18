# Reword — Feature Roadmap

A living list of ideas and improvements, roughly ordered by impact and feasibility.

---

## Near-term (polish & reach)

### [ ] New platforms
- **Slack** — workplace messaging where tone matters most
- **Discord** — community and team DMs
- **WhatsApp Web** — personal relationships, high emotional stakes
- **Outlook Web** — enterprise email complement to Gmail
- **Teams Web** — Microsoft ecosystem workplaces

### [ ] UX improvements
- **Inline diff view** — highlight exactly which words changed in each rewrite option
- **Keyboard shortcuts** — accept a rewrite without touching the mouse (e.g., `Alt+1/2/3`)
- **Undo rewrite** — restore the original draft after accepting a rewrite
- **Badge animation** — subtle pulse on the trigger icon to draw attention without being annoying
- **Dark mode** — popup card respects the OS/site dark theme
- **Dismiss memory** — "don't flag this phrase again" per-user suppression list

### [ ] Heuristic improvements
- **Sarcasm patterns** — detect "oh great", "sure, no problem at all", "wow, thanks"
- **Hedging overload** — flag messages buried in so many qualifiers they read as passive
- **Exclamation mark inflation** — "Fine!!!" reads differently from "Fine."
- **Emoji-as-tone** — 🙄 and 😒 change a message's tone even if the words are neutral

---

## Medium-term (smarter AI)

### [ ] Better analysis
- **Thread-aware rewrites** — use full conversation history to suggest replies that de-escalate ongoing tension, not just rewrite a single message
- **Recipient tone mirroring** — detect if the other person is being curt and suggest matching their energy rather than forcing warmth
- **Cultural context** — direct communication is valued differently across cultures; let users flag their context
- **Language support** — non-English messages (Spanish, French, Mandarin, etc.)

### [ ] Personalization
- **Learn from your choices** — track which rewrites you pick and tune suggestions to your style over time (stored locally)
- **Custom tone goals** — beyond Warmer/Direct/Minimal, let users define their own (e.g., "More formal", "Sound less anxious")
- **Per-contact profiles** — set relationship type for a specific Gmail contact, not just a whole domain
- **Time-of-day awareness** — late-night messages often read harsher; optionally factor this in

### [ ] AI model options
- **Claude support** — alternative to Gemini for users who prefer Anthropic
- **OpenAI support** — GPT-4o as a backend option
- **Local LLM** — Ollama integration for fully offline, fully private analysis
- **Model selector in options** — let users pick their preferred provider and model

---

## Long-term (bigger bets)

### [ ] Proactive features
- **"Cool down" mode** — detect if you've been in a rapid back-and-forth for > 5 minutes and suggest taking a break before replying
- **Conversation health score** — after a thread ends, show a summary: "This conversation had 3 flagged messages; here's what worked and what didn't"
- **Draft save-and-remind** — "You wrote this at 11 PM. Want to re-read it in the morning?" (opt-in)

### [ ] Team / shared features
- **Shared suppression lists** — teams can share a list of flagged phrases to avoid (e.g., "per my last email")
- **Manager view** — aggregate (anonymized) tone analytics for a team's external communications
- **Slack bot mode** — server-side companion that privately DMs a user before they post in a channel

### [ ] Platform
- **Firefox support** — port to Manifest V3 for Firefox once Firefox MV3 support stabilizes
- **Safari extension** — cover macOS/iOS Safari users
- **Mobile keyboard** — iOS/Android custom keyboard that runs the same checks natively

### [ ] Developer experience
- **Plugin API** — let third parties add new platform adapters and tone-check rules without forking
- **Webhook mode** — send analysis results to a user-configured endpoint (useful for enterprise integrations)
- **CLI tool** — `reword check "your message here"` for scripting and CI checks on templated emails

---

## Icebox (interesting but deferred)

- **Voice-to-text integration** — check tone before a voice message is sent
- **Email scheduling + tone gate** — only send if tone passes a threshold (requires deeper Gmail integration)
- **Tone coaching mode** — weekly recap of your flagged patterns with suggestions for long-term improvement
- **Browser-native sharing** — share a rewrite option directly via Web Share API

---

*Want to work on one of these? Open an issue or start a discussion in the repo.*
