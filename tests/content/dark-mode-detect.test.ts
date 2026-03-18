import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectPlatformDarkMode } from '../../src/content/dark-mode-detect';

describe('detectPlatformDarkMode', () => {
  let locationSpy: ReturnType<typeof vi.spyOn>;

  function setHostname(hostname: string) {
    locationSpy = vi.spyOn(window, 'location', 'get');
    locationSpy.mockReturnValue({ hostname } as Location);
  }

  beforeEach(() => {
    document.documentElement.removeAttribute('data-darkmode');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-color-mode');
    document.documentElement.className = '';
    document.body.innerHTML = '';
    document.body.className = '';
    document.body.removeAttribute('style');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Gmail (mail.google.com)', () => {
    beforeEach(() => setHostname('mail.google.com'));

    it('detects dark mode via data-darkmode attribute on html', () => {
      document.documentElement.setAttribute('data-darkmode', 'true');
      expect(detectPlatformDarkMode()).toBe(true);
    });

    it('detects dark mode via .dark class on body', () => {
      document.body.classList.add('dark');
      expect(detectPlatformDarkMode()).toBe(true);
    });
  });

  describe('LinkedIn (www.linkedin.com)', () => {
    beforeEach(() => setHostname('www.linkedin.com'));

    it('detects dark mode via data-theme="dark" on html', () => {
      document.documentElement.setAttribute('data-theme', 'dark');
      expect(detectPlatformDarkMode()).toBe(true);
    });

    it('detects dark mode via .theme--dark class on body', () => {
      document.body.classList.add('theme--dark');
      expect(detectPlatformDarkMode()).toBe(true);
    });
  });

  describe('Twitter/X', () => {
    it('detects "Lights out" dark background on x.com', () => {
      setHostname('x.com');
      document.body.setAttribute('style', 'background-color: rgb(0, 0, 0);');
      expect(detectPlatformDarkMode()).toBe(true);
    });

    it('detects "Dim" dark background on x.com', () => {
      setHostname('x.com');
      document.body.setAttribute('style', 'background-color: rgb(21, 32, 43);');
      expect(detectPlatformDarkMode()).toBe(true);
    });

    it('detects data-color-mode="dark" on twitter.com', () => {
      setHostname('twitter.com');
      document.documentElement.setAttribute('data-color-mode', 'dark');
      expect(detectPlatformDarkMode()).toBe(true);
    });
  });

  describe('Slack', () => {
    it('detects .sk-client-theme--dark on body for app.slack.com', () => {
      setHostname('app.slack.com');
      document.body.classList.add('sk-client-theme--dark');
      expect(detectPlatformDarkMode()).toBe(true);
    });
  });

  describe('Discord', () => {
    it('detects .theme-dark on html for discord.com', () => {
      setHostname('discord.com');
      document.documentElement.classList.add('theme-dark');
      expect(detectPlatformDarkMode()).toBe(true);
    });
  });

  describe('Generic fallback (computed background luminance)', () => {
    it('returns true when body background luminance < 0.4', () => {
      setHostname('example.com');
      vi.spyOn(window, 'getComputedStyle').mockReturnValue({
        backgroundColor: 'rgb(30, 30, 30)',
      } as CSSStyleDeclaration);
      expect(detectPlatformDarkMode()).toBe(true);
    });

    it('returns false for light backgrounds (luminance >= 0.4)', () => {
      setHostname('example.com');
      vi.spyOn(window, 'getComputedStyle').mockReturnValue({
        backgroundColor: 'rgb(255, 255, 255)',
      } as CSSStyleDeclaration);
      expect(detectPlatformDarkMode()).toBe(false);
    });
  });

  describe('No dark mode indicators', () => {
    it('returns false when no dark mode signals are present', () => {
      setHostname('mail.google.com');
      vi.spyOn(window, 'getComputedStyle').mockReturnValue({
        backgroundColor: 'rgb(255, 255, 255)',
      } as CSSStyleDeclaration);
      expect(detectPlatformDarkMode()).toBe(false);
    });
  });
});
