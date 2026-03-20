# Security Policy

## [ ] Reporting a vulnerability

If you discover a security vulnerability in Reword, please report it responsibly:

1. **Do not** open a public issue.
2. Email **security@reword.dev** (or open a private GitHub security advisory) with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
3. We will acknowledge within 48 hours and aim to fix critical issues within 7 days.

## [ ] Scope

Reword runs entirely in your browser. There is no Reword server. The only network call is to the Gemini API using your own API key. Relevant security concerns include:

- Content script injection or XSS in the popup card
- API key leakage through storage or message passing
- Unintended data exfiltration via the Gemini API call
- DOM manipulation vulnerabilities in platform adapters

## [ ] Supported versions

| Version | Supported |
| ------- | --------- |
| 0.2.x   | Yes       |
| < 0.2   | No        |
