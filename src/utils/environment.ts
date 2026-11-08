import { EnvironmentMetadata } from '../types/schema';

export function parseOS(ua: string): string {
  if (!ua) return 'Unknown';
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Windows NT/i.test(ua)) return 'Windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Unknown';
}

export function parseBrowser(ua: string): string {
  if (!ua) return 'Unknown';
  // Check Edge before Chrome because Edge includes Chrome token
  const edgeMatch = ua.match(/Edg(?:e)?\/(\d+)/i);
  if (edgeMatch) return `Edge ${edgeMatch[1]}`;

  const chromeMatch = ua.match(/Chrome\/(\d+)/i);
  if (chromeMatch) return `Chrome ${chromeMatch[1]}`;

  const firefoxMatch = ua.match(/Firefox\/(\d+)/i);
  if (firefoxMatch) return `Firefox ${firefoxMatch[1]}`;

  const safariMatch = ua.match(/Version\/(\d+).*Safari/i);
  if (safariMatch) return `Safari ${safariMatch[1]}`;

  return 'Unknown';
}

export function extractEnvironmentMetadata(): EnvironmentMetadata {
  const isBrowser = typeof window !== 'undefined';
  const ua = isBrowser && navigator?.userAgent ? navigator.userAgent : '';

  const viewport = {
    width: isBrowser ? window.innerWidth || 0 : 0,
    height: isBrowser ? window.innerHeight || 0 : 0
  };

  const screenResolution = isBrowser && window.screen ? {
    width: window.screen.width || 0,
    height: window.screen.height || 0
  } : undefined;

  return {
    os: parseOS(ua),
    browser: parseBrowser(ua),
    screenResolution,
    viewport,
    devicePixelRatio: isBrowser ? window.devicePixelRatio || 1 : 1,
    language: isBrowser && navigator?.language ? navigator.language : 'en-US',
    online: isBrowser && typeof navigator?.onLine === 'boolean' ? navigator.onLine : true
  };
}
