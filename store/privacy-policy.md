# Privacy Policy — Reword Chrome Extension

**Last updated:** March 17, 2026

## Overview

Reword is a Chrome extension that detects problematic tone in your messages and suggests kinder rewrites. This privacy policy explains what data Reword accesses, how it is used, and what is stored.

The short version: Reword does not collect, store, or transmit your data to any server we operate. We do not have servers.

## What Data Reword Accesses

Reword reads the text you type into compose fields on supported platforms (Gmail, LinkedIn, Twitter/X, Slack, Discord) in order to analyze tone and offer rewrite suggestions. This is the core functionality of the extension.

**This text is processed in one of three ways:**

1. **Local heuristic analysis** — Your message is checked against keyword patterns and rules entirely within your browser. No network request is made. This handles the majority of messages.

2. **Chrome on-device AI** — If available in your browser, Chrome's built-in AI model analyzes the message locally on your device. No data leaves your machine.

3. **Google Gemini API** — For messages that require deeper analysis, the text is sent to the Google Gemini API for tone evaluation and rewrite generation. This request is made directly from your browser to Google's API servers using your own API key. Reword's developers never see, intercept, or have access to this communication.

## What Data Is Stored

Reword stores the following data locally in your browser using `chrome.storage.local`:

- **Your Gemini API key** — Encrypted and stored locally so you don't have to re-enter it
- **Sensitivity preference** — Your chosen sensitivity level (low, medium, high)
- **Relationship profiles** — Domain-to-context mappings you configure (e.g., "mail.google.com" = "workplace")
- **Usage statistics** — Aggregate counts (messages analyzed, rewrites accepted) stored locally for the options page display

This data never leaves your browser. It is not synced to any cloud service, not transmitted to any server, and not accessible to any third party.

## What Data Is NOT Collected

Reword does **not** collect, store, or transmit:

- Your messages or message content (beyond real-time analysis)
- Your email addresses or contact information
- Your browsing history
- Your identity or account information on any platform
- Any personally identifiable information
- Any analytics or telemetry data

## Third-Party Services

### [ ] Google Gemini API

When local analysis is insufficient, Reword sends message text to the Google Gemini API for tone analysis. This connection is:

- Made directly from your browser to Google's servers
- Authenticated with your own API key (which you provide)
- Subject to [Google's API Terms of Service](https://ai.google.dev/terms) and [Privacy Policy](https://policies.google.com/privacy)
- Used only for real-time analysis — Google's API does not store prompts from free-tier API keys by default (see Google's data usage policy for details)

Reword's developers have no access to your API key or the data sent to Google.

### [ ] No Other Third-Party Services

Reword does not use:

- Analytics services (no Google Analytics, no Mixpanel, no Amplitude)
- Crash reporting services
- Advertising networks
- Social login or authentication services
- Any CDN or remote asset loading
- Any server-side component whatsoever

## Cookies and Tracking

Reword does not use cookies, web beacons, pixels, or any other tracking technology.

## Permissions Explained

| Permission                                                    | Why It's Needed                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `storage`                                                     | Save your settings (API key, sensitivity, relationship profiles) locally in your browser   |
| `activeTab`                                                   | Read the compose field on the current tab to analyze your message and inject the review UI |
| Host permissions (Gmail, LinkedIn, Twitter/X, Slack, Discord) | Allow the content script to run on these specific sites to detect compose fields           |
| Host permission (googleapis.com)                              | Allow your browser to send requests to the Gemini API using your API key                   |

## Data Retention

Reword does not retain your message content. Messages are analyzed in real time and immediately discarded after the analysis result is displayed. No message text is written to disk, logged, or cached.

Local settings (API key, preferences, profiles) persist in `chrome.storage.local` until you uninstall the extension or clear the data manually.

## Children's Privacy

Reword does not knowingly collect any information from children under 13 years of age. The extension does not collect information from any user.

## Changes to This Policy

If this privacy policy is updated, the changes will be posted here with an updated "Last updated" date. Significant changes will be noted in the extension's changelog.

## Open Source

Reword is open source under the MIT license. You can review the complete source code to verify these privacy claims. The code is available at: [GitHub repository URL]

## Contact

If you have questions about this privacy policy or Reword's data practices, please contact:

- **Email:** [your-email@example.com]
- **GitHub Issues:** [repository issues URL]

---

_This privacy policy applies to the Reword Chrome extension version 0.2.0 and later._
