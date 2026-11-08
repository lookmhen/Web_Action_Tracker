import { RecordedSession, ActionEvent, NetworkEvent, ConsoleEvent, isActionEvent, isNetworkEvent, isConsoleEvent } from '../types/schema';
import { computeBestSelector } from '../utils/selectors';

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const YYYY = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const DD = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}`;
}

function formatActionStep(event: ActionEvent, index: number): string {
  const s = event.selectors;
  const targetDesc = computeTargetDescription(event);
  const bestSelector = computeBestSelector(s);

  switch (event.type) {
    case 'click':
      return `${index}. **Click:** ${targetDesc} (\`${bestSelector}\`)`;
    case 'input':
    case 'change': {
      const val = event.isSensitive ? '******' : (event.value ? `"${event.value}"` : '""');
      return `${index}. **Type into:** ${targetDesc} (\`${bestSelector}\`) ➔ ${val}`;
    }
    case 'keydown':
      return `${index}. **Press Key:** \`${event.key || 'Unknown'}\` on ${targetDesc} (\`${bestSelector}\`)`;
    default:
      return `${index}. **Action (${event.type}):** ${targetDesc} (\`${bestSelector}\`)`;
  }
}

function computeTargetDescription(event: ActionEvent): string {
  const s = event.selectors;
  const tagCapitalized = s.tag.charAt(0).toUpperCase() + s.tag.slice(1);

  if (s.tag === 'button') {
    return s.text ? `Button **"${s.text}"**` : (s.name ? `Button **"${s.name}"**` : 'Button');
  }
  if (s.tag === 'a') {
    return s.text ? `Link **"${s.text}"**` : (s.name ? `Link **"${s.name}"**` : 'Link');
  }
  if (s.tag === 'input' || s.tag === 'textarea') {
    const label = s.name || s.id || s.testId || 'Field';
    return `Input \`${label}\``;
  }
  return `${tagCapitalized} ${s.text ? `**"${s.text}"**` : ''}`.trim();
}

export function exportToMarkdown(session: RecordedSession): string {
  const lines: string[] = [];

  lines.push('## 🐛 Bug Reproduction Report\n');
  lines.push(`* **Recorded At:** ${formatDate(session.metadata.startedAt)}`);
  lines.push(`* **Initial URL:** \`${session.metadata.startUrl}\``);
  const vp = session.metadata.viewport;
  lines.push(`* **Browser / Viewport:** Chrome | ${vp.width} x ${vp.height}\n`);

  if (session.metadata.environment) {
    const env = session.metadata.environment;
    lines.push('---\n');
    lines.push('## 💻 System & Environment\n');
    lines.push('| Environment Property | Value |');
    lines.push('| :--- | :--- |');
    if (env.os) lines.push(`| OS | ${env.os} |`);
    if (env.browser) lines.push(`| Browser | ${env.browser} |`);
    if (env.screenResolution) lines.push(`| Screen Resolution | ${env.screenResolution.width} x ${env.screenResolution.height} |`);
    if (env.viewport) lines.push(`| Viewport | ${env.viewport.width} x ${env.viewport.height} |`);
    if (env.devicePixelRatio !== undefined) lines.push(`| Device Pixel Ratio | ${env.devicePixelRatio} |`);
    if (env.language) lines.push(`| Language | ${env.language} |`);
    if (env.online !== undefined) lines.push(`| Online | ${env.online ? 'Yes' : 'No'} |`);
    lines.push('');
  }

  lines.push('---\n');
  lines.push('### 📋 Steps to Reproduce');

  const actionEvents = session.events.filter(isActionEvent);
  if (actionEvents.length === 0) {
    lines.push('No events recorded.\n');
  } else {
    actionEvents.forEach((action, idx) => {
      lines.push(formatActionStep(action, idx + 1));
    });
    lines.push('');
  }

  const failures: (NetworkEvent | ConsoleEvent)[] = [];
  session.events.forEach(e => {
    if (isNetworkEvent(e) && (e.status >= 400 || e.status === 0 || e.error)) {
      failures.push(e);
    } else if (isConsoleEvent(e) && e.level === 'error') {
      failures.push(e);
    }
  });

  if (failures.length > 0) {
    lines.push('---\n');
    lines.push('### ❌ Detected Failures\n');

    let failIndex = 1;
    for (const fail of failures) {
      if (isNetworkEvent(fail)) {
        lines.push(`#### ${failIndex++}. Network Failure (HTTP ${fail.status})`);
        lines.push(`* **Endpoint:** \`${fail.method} ${fail.requestUrl}\``);
        lines.push(`* **Duration:** ${fail.durationMs}ms`);
        if (fail.requestPayload) {
          lines.push(`* **Request Payload:**\n<details><summary>Request Payload</summary>\n\n\`\`\`json\n${fail.requestPayload}\n\`\`\`\n</details>`);
        }
        if (fail.responsePreview) {
          lines.push(`* **Response Payload:** \`${fail.responsePreview}\``);
        }
        if (fail.error) {
          lines.push(`* **Error:** \`${fail.error}\``);
        }
        lines.push('');
      } else if (isConsoleEvent(fail)) {
        lines.push(`#### ${failIndex++}. Uncaught Console Error`);
        lines.push(`* **Error:** \`${fail.message}\``);
        if (fail.stackTrace) {
          lines.push(`* **Source:** \`${fail.stackTrace}\``);
        }
        lines.push('');
      }
    }
  }

  if (session.screenshots && session.screenshots.length > 0) {
    lines.push('---\n');
    lines.push('## 📸 Visual Evidence\n');
    session.screenshots.forEach((shot, idx) => {
      lines.push(`#### Screenshot ${idx + 1} (${shot.trigger})`);
      lines.push(`* **Trigger:** \`${shot.trigger}\``);
      if (shot.url) lines.push(`* **URL:** \`${shot.url}\``);
      if (shot.label) lines.push(`* **Note:** ${shot.label}`);
      lines.push(`<details><summary>📸 View Image (Base64)</summary>\n\n<img src="${shot.dataUrl}" alt="Screenshot ${idx + 1}" width="600" />\n</details>\n`);
    });
  }

  return lines.join('\n');
}
