import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractEnvironmentMetadata, parseOS, parseBrowser } from '../src/utils/environment';

describe('Environment Metadata Utility', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts OS, browser, viewport, screen resolution, DPR, language and online status', () => {
    const meta = extractEnvironmentMetadata();

    expect(meta.viewport).toBeDefined();
    expect(typeof meta.viewport.width).toBe('number');
    expect(typeof meta.viewport.height).toBe('number');
    expect(meta.screenResolution).toBeDefined();
    expect(typeof meta.screenResolution?.width).toBe('number');
    expect(typeof meta.screenResolution?.height).toBe('number');
    expect(typeof meta.devicePixelRatio).toBe('number');
    expect(typeof meta.language).toBe('string');
    expect(typeof meta.online).toBe('boolean');
    expect(typeof meta.os).toBe('string');
    expect(typeof meta.browser).toBe('string');
  });

  describe('parseOS', () => {
    it('detects Windows', () => {
      expect(parseOS('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')).toBe('Windows');
    });

    it('detects macOS', () => {
      expect(parseOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15')).toBe('macOS');
    });

    it('detects Linux', () => {
      expect(parseOS('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36')).toBe('Linux');
    });

    it('detects Android', () => {
      expect(parseOS('Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36')).toBe('Android');
    });

    it('detects iOS', () => {
      expect(parseOS('Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15')).toBe('iOS');
    });

    it('returns Unknown for unrecognized agent', () => {
      expect(parseOS('CustomAgent/1.0')).toBe('Unknown');
    });
  });

  describe('parseBrowser', () => {
    it('detects Chrome', () => {
      expect(parseBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36')).toBe('Chrome 130');
    });

    it('detects Edge', () => {
      expect(parseBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0')).toBe('Edge 130');
    });

    it('detects Firefox', () => {
      expect(parseBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0')).toBe('Firefox 132');
    });

    it('detects Safari', () => {
      expect(parseBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15')).toBe('Safari 17');
    });

    it('returns Unknown for unrecognized browser', () => {
      expect(parseBrowser('curl/7.68.0')).toBe('Unknown');
    });
  });
});
