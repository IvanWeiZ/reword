/**
 * Detects platform-specific dark mode by checking known CSS classes and
 * computed background color. Gmail, LinkedIn, and Twitter/X each have their
 * own dark mode toggles that do not necessarily match the OS preference.
 */
export function detectPlatformDarkMode(): boolean {
  const host = window.location.hostname;

  // Gmail: dark theme adds a class on the html element
  if (host === 'mail.google.com') {
    // Gmail uses a dark background on the body when dark theme is active
    if (document.documentElement.getAttribute('data-darkmode') === 'true') return true;
    if (document.body?.classList.contains('dark')) return true;
  }

  // LinkedIn: uses a media-theme attribute on the html element
  if (host === 'www.linkedin.com') {
    const theme = document.documentElement.getAttribute('data-theme');
    if (theme === 'dark') return true;
    if (document.body?.classList.contains('theme--dark')) return true;
  }

  // Twitter / X: uses a dark background-color on body
  if (host === 'x.com' || host === 'twitter.com') {
    const bg = document.body?.getAttribute('style') ?? '';
    if (bg.includes('background-color: rgb(0, 0, 0)')) return true; // Lights out
    if (bg.includes('background-color: rgb(21, 32, 43)')) return true; // Dim
    if (document.documentElement.getAttribute('data-color-mode') === 'dark') return true;
  }

  // Slack: uses a data-theme attribute
  if (host.endsWith('.slack.com') || host === 'app.slack.com') {
    if (document.body?.classList.contains('sk-client-theme--dark')) return true;
  }

  // Discord: always dark by default, but check anyway
  if (host === 'discord.com') {
    if (document.documentElement.classList.contains('theme-dark')) return true;
  }

  // Generic fallback: sample the computed background color of <body>
  return isBodyBackgroundDark();
}

/**
 * Returns true if the computed background-color of document.body is dark
 * (perceived luminance below 0.4). This catches platforms we don't
 * explicitly know about.
 */
function isBodyBackgroundDark(): boolean {
  if (!document.body) return false;
  try {
    const bg = window.getComputedStyle(document.body).backgroundColor;
    const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return false;
    const r = parseInt(match[1], 10);
    const g = parseInt(match[2], 10);
    const b = parseInt(match[3], 10);
    // Relative luminance (simplified sRGB)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.4;
  } catch {
    return false;
  }
}
