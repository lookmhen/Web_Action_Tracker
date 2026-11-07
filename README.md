# Web action tracker and bug replay

A Chrome extension (Manifest V3) that records user interactions, captures network errors and console logs, inspects DOM elements, and replays recorded sessions directly in the browser. It exports sessions to Markdown bug reports, Playwright test scripts, or JSON files.

## Features

- **Action recording.** Records clicks, inputs, changes, and key presses with automatic masking for passwords and sensitive fields.
- **Navigation tracking.** Records page transitions and reloads through `chrome.webNavigation`.
- **Telemetry capture.** Intercepts failed `fetch` and `XMLHttpRequest` calls (status 400 or higher) and uncaught console errors from the page.
- **In-browser replay.** Replays actions step by step with polling for target elements and support for framework input trackers.
- **Element inspector.** Press `Alt+X` to inspect elements with computed CSS styles, dimensions, box model metrics, and CSS selectors. Click any element to copy its full details.
- **Session exports.** Exports reproduction steps to Markdown reports, executable Playwright scripts, and JSON dumps.

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/lookmhen/Web_Action_Tracker.git
   cd Web_Action_Tracker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Load the extension in Chrome:
   - Open `chrome://extensions` in your browser.
   - Turn on Developer mode in the top right corner.
   - Click Load unpacked.
   - Select the `dist` directory inside the project folder.

## Usage

### Recording actions

1. Open the target website.
2. Click the extension icon in the toolbar.
3. Click Record. The toolbar badge displays `REC`.
4. Interact with the website. The badge counts recorded actions.
5. Open the popup and click Stop to finish recording.

### Inspecting elements

1. Press `Alt+X` or click Inspect in the popup.
2. Hover over any element to view its tag name, dimensions, colors, padding, margin, and CSS selector.
3. Click the element to copy its selector and styling details to your clipboard.
4. Press `Alt+X` or `Escape` to close the inspector.

### Replaying a session

1. Open the popup.
2. Click Replay to rerun the recorded session in the active tab, or import a previously exported JSON file first.

### Exporting reports

From the popup:
- Click Markdown to copy a bug reproduction report.
- Click Playwright to copy an automated test script.
- Click JSON to copy the complete session payload.

## Development

- Run the test suite:
  ```bash
  npm test
  ```

- Build for production:
  ```bash
  npm run build
  ```

- Start watch mode during development:
  ```bash
  npm run dev
  ```

## Project structure

```
Web_Action_Tracker/
├── public/                 # Static assets and manifest.json
│   ├── icons/              # Extension icons (16px, 48px, 128px)
│   └── manifest.json       # Manifest V3 configuration
├── src/
│   ├── background/         # Service worker state manager and navigation listeners
│   ├── content-script/     # DOM event listeners, element inspector, replay runner
│   ├── exporters/          # Markdown, Playwright, and JSON export generators
│   ├── main-world/         # Injected script for fetch and console error telemetry
│   ├── types/              # TypeScript schema definitions and type guards
│   ├── ui/                 # Popup UI interface and styles
│   └── utils/              # Masking and selector resolution utilities
├── tests/                  # Vitest unit and integration test suites
└── vite.config.ts          # Vite build configuration with multi-entry packaging
```

## License

MIT
