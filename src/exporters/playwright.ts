import { RecordedSession, ActionEvent, isActionEvent, isNetworkEvent, isConsoleEvent } from '../types/schema';

function computePlaywrightLocator(action: ActionEvent): string {
  const s = action.selectors;

  if (s.testId) {
    return `page.getByTestId('${escapeString(s.testId)}')`;
  }
  if (s.role && s.name) {
    return `page.getByRole('${escapeString(s.role)}', { name: '${escapeString(s.name)}' })`;
  }
  if (s.id) {
    return `page.locator('#${escapeString(s.id)}')`;
  }
  if (s.text && (s.tag === 'button' || s.tag === 'a')) {
    return `page.getByText('${escapeString(s.text)}')`;
  }
  return `page.locator('${escapeString(s.css)}')`;
}

function escapeString(val: string): string {
  return val.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function exportToPlaywright(session: RecordedSession): string {
  const lines: string[] = [];

  lines.push("import { test, expect } from '@playwright/test';\n");
  lines.push("test('Automated Bug Reproduction', async ({ page }) => {");
  lines.push("  test.setTimeout(60000);\n");
  lines.push("  // 1. Initial Navigation");
  lines.push(`  await page.goto('${escapeString(session.metadata.startUrl)}');\n`);
  lines.push("  // 2. Automated Reproduction Steps");

  const actionEvents = session.events.filter(isActionEvent);
  if (actionEvents.length === 0) {
    lines.push("  // No user actions recorded\n");
  } else {
    for (const action of actionEvents) {
      const locator = computePlaywrightLocator(action);
      switch (action.type) {
        case 'click':
          lines.push(`  await ${locator}.click();`);
          break;
        case 'input':
        case 'change': {
          const val = action.isSensitive ? '******' : (action.value ? escapeString(action.value) : '');
          lines.push(`  await ${locator}.fill('${val}');`);
          break;
        }
        case 'keydown':
          lines.push(`  await ${locator}.press('${escapeString(action.key || 'Enter')}');`);
          break;
        default:
          lines.push(`  // Action ${action.type} on ${locator}`);
      }
    }
    lines.push('');
  }

  // Check failures to append bug annotations
  const failureComments: string[] = [];
  session.events.forEach(e => {
    if (isNetworkEvent(e) && (e.status >= 400 || e.status === 0 || e.error)) {
      failureComments.push(`  // Network Error: ${e.method} ${e.requestUrl} -> ${e.status}${e.error ? ` (${e.error})` : ''}`);
    } else if (isConsoleEvent(e) && e.level === 'error') {
      failureComments.push(`  // Console Error: ${e.message}`);
    }
  });

  if (failureComments.length > 0) {
    lines.push("  // [BUG DETECTED HERE]");
    failureComments.forEach(fc => lines.push(fc));
  }

  lines.push("});");

  return lines.join('\n');
}
