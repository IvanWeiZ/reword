# Chrome Web Store Listing — Reword

## Short Description (132 characters)

Catch passive-aggressive tone in Gmail, LinkedIn & Twitter. Get AI-powered kinder rewrites before you hit Send. Privacy-first.

## Detailed Description

See `description.txt` for the full Chrome Web Store description text.

## Store Metadata

- **Extension name:** Reword
- **Category:** Productivity
- **Language:** English
- **Website:** (to be added)
- **Support URL:** (GitHub Issues link to be added)

## Tags / Keywords

- tone checker
- email rewrite
- passive aggressive
- communication
- Gmail tone
- LinkedIn messages
- professional writing
- workplace communication
- email assistant
- message rewriter
- tone analyzer

## Screenshots Needed

Capture the following at 1280x800 or 640x400 resolution. Use a clean Chrome profile with no other extensions visible.

1. **Trigger badge in Gmail** — Show a Gmail compose window with a slightly passive-aggressive message typed, and the "Review tone" badge visible near the Send button. Demonstrates automatic detection.

2. **Popup card with rewrites** — Show the popup card open over a Gmail compose window, displaying the risk assessment and three rewrite options (Warmer, Direct, Minimal). This is the money shot.

3. **Before and after** — Side-by-side or sequence showing the original harsh message and the rewritten version inserted into the compose box. Demonstrates the one-click rewrite flow.

4. **LinkedIn integration** — Show Reword working inside a LinkedIn message thread. Demonstrates multi-platform support.

5. **Twitter/X integration** — Show Reword working in a Twitter DM or tweet compose. Demonstrates breadth of platform support.

6. **Options page** — Show the settings page with the API key field, sensitivity slider, and relationship profile configuration. Demonstrates customization.

7. **Relationship profiles** — Close-up of the relationship profile settings showing different contexts (workplace, romantic, family) mapped to different domains.

## Promotional Images

- **Small promo tile (440x280):** Extension icon with tagline "Catch tone issues before you hit Send"
- **Marquee promo (1400x560):** Split view showing a harsh message on the left and a kind rewrite on the right, with the Reword icon in the center

## Privacy Practices Disclosure

The Chrome Web Store requires declaring data usage. Here is what to select:

### [ ] Single Purpose Description

"Detects problematic tone in user-composed messages on supported platforms and offers AI-powered kinder rewrite suggestions."

### [ ] Data Usage Disclosures

| Data Type                           | Collected? | Usage                                                                                                                                                                                                                       |
| ----------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personally identifiable information | No         | Not collected                                                                                                                                                                                                               |
| Health information                  | No         | Not collected                                                                                                                                                                                                               |
| Financial information               | No         | Not collected                                                                                                                                                                                                               |
| Authentication information          | No         | Not collected                                                                                                                                                                                                               |
| Personal communications             | No         | Not stored. Message text is analyzed locally or sent to Google Gemini API using the user's own API key for real-time analysis only. No messages are stored, logged, or transmitted to any server operated by the developer. |
| Location                            | No         | Not collected                                                                                                                                                                                                               |
| Web history                         | No         | Not collected                                                                                                                                                                                                               |
| User activity                       | No         | Not collected                                                                                                                                                                                                               |
| Website content                     | No         | Not collected                                                                                                                                                                                                               |

### [ ] Certifications

- [x] The extension does not sell user data to third parties
- [x] The extension does not use or transfer user data for purposes unrelated to the extension's single purpose
- [x] The extension does not use or transfer user data to determine creditworthiness or for lending purposes

### [ ] Permissions Justification

| Permission                                           | Justification                                                                                                                                 |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                                            | Store user preferences (API key, sensitivity level, relationship profiles) locally in chrome.storage.local. No data is synced or transmitted. |
| `activeTab`                                          | Access the DOM of the active tab to detect compose fields and inject the tone review UI on supported platforms (Gmail, LinkedIn, Twitter/X).  |
| Host permission: `mail.google.com`                   | Inject content script to detect Gmail compose fields and provide tone analysis.                                                               |
| Host permission: `www.linkedin.com`                  | Inject content script to detect LinkedIn message fields and provide tone analysis.                                                            |
| Host permission: `x.com`, `twitter.com`              | Inject content script to detect Twitter/X compose fields and provide tone analysis.                                                           |
| Host permission: `*.slack.com`                       | Inject content script to detect Slack message fields and provide tone analysis.                                                               |
| Host permission: `discord.com`                       | Inject content script to detect Discord message fields and provide tone analysis.                                                             |
| Host permission: `generativelanguage.googleapis.com` | Send user-composed message text to Google Gemini API for AI-powered tone analysis, using the user's own API key.                              |

## Review Notes for Chrome Web Store Team

Reword is a developer tools / productivity extension. To test it:

1. Install the extension
2. Open Options and enter a valid Gemini API key (free from https://aistudio.google.com/apikey)
3. Navigate to Gmail and compose a new message
4. Type a passive-aggressive message, e.g., "Per my last email, I already covered this."
5. Wait 2 seconds — the "Review tone" badge should appear
6. Click the badge to see rewrite suggestions
