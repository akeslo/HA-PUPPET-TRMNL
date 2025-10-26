# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
Home Assistant add-on repository containing experimental add-ons. Currently contains **Puppet**: a Puppeteer-based scheduled screenshot service that automatically captures Home Assistant dashboards and saves them to disk, optimized for e-ink displays and other screen types.

## Architecture

### Puppet Add-on Structure
- **Scheduler** (`scheduler.js`): Main entry point that manages scheduled screenshot jobs based on JSON configuration
- **Browser Management** (`screenshot.js`): Puppeteer wrapper managing Chromium lifecycle, page navigation, and screenshot capture
- **File Manager** (`file-manager.js`): Handles saving screenshots to `/config/www/screenshots/` with organized folder structure
- **BMP Encoding** (`bmp.js`): Custom BMP encoder supporting 1-bit and 24-bit color depths for e-ink compatibility
- **Configuration** (`const.js`): Options loader supporting both development (`options-dev.json`) and production (`/data/options.json`) configs
- **Error Handling** (`error.js`): Custom error types for page loading failures

### Key Technical Details

**Scheduler System**:
- Reads screenshot configuration from `/data/screenshots.json` (add-on) or `screenshots-dev.json` (dev)
- Each screenshot runs on independent interval timer (setInterval)
- All jobs share single Browser instance to minimize resource usage
- Graceful shutdown on SIGTERM/SIGINT signals
- Screenshots saved to `/config/www/screenshots/<name>/latest.<format>`

**Browser Lifecycle**:
- Browser remains active throughout scheduler lifetime (no automatic cleanup)
- `busy` flag pattern prevents concurrent browser operations
- Cold start includes 2.5s extra wait; warm start 750ms (add-on) or 500ms (dev)
- Navigation optimizes by using Home Assistant's `location-changed` event instead of full page reload

**Screenshot Processing Pipeline**:
1. Puppeteer captures PNG at viewport + 56px header height
2. Sharp processes image (rotate, e-ink color reduction, format conversion)
3. Custom BMP encoding for e-ink displays when needed
4. Header cropped from final output (HEADER_HEIGHT = 56px)

**E-ink Optimization**:
- 2-color mode: threshold at 220, optional invert, outputs as b-w colorspace
- Supports 1-bit, 2-bit, 4-bit, and 8-bit BMP encoding
- Format restrictions: BMP and PNG only when `eink` parameter used

**Home Assistant Integration**:
- Uses long-lived access token for authentication via localStorage.hassTokens
- Waits for DOM elements: `home-assistant` → `home-assistant-main` → `partial-panel-resolver` → panel
- Injects auth tokens via `evaluateOnNewDocument` before navigation
- Monitors `_loading` property on panel elements for readiness

**File Organization**:
- Each screenshot gets dedicated folder: `/config/www/screenshots/<name>/`
- Always saves as `latest.<format>` for consistent URLs
- Optional history mode saves timestamped copies (currently disabled)
- Files accessible via Home Assistant at `/local/screenshots/<name>/latest.<format>`

## Development Setup

### Local Development
1. Copy `puppet/ha-puppet/options-dev.json.sample` to `puppet/ha-puppet/options-dev.json`
2. Configure your Home Assistant URL and long-lived access token
3. Set `chromium_executable` path for your system (defaults to Google Chrome on macOS)
4. Copy `puppet/ha-puppet/screenshots-example.json` to `puppet/ha-puppet/screenshots-dev.json`
5. Configure your desired screenshots in `screenshots-dev.json`
6. Install dependencies: `cd puppet/ha-puppet && npm ci`
7. Run scheduler: `node puppet/ha-puppet/scheduler.js`
8. Screenshots saved to `puppet/ha-puppet/output/`

### Build Commands
**Docker Build** (from repository root):
```bash
docker build -t puppet -f puppet/Dockerfile .
```

**Run Container**:
```bash
docker run -v /path/to/options.json:/data/options.json -v /path/to/screenshots.json:/data/screenshots.json -v /path/to/www:/config/www puppet
```

### Screenshot Configuration
Create `screenshots-dev.json` or `/config/screenshots.json` with:
- `name`: Unique identifier for folder/file organization
- `path`: Home Assistant path (e.g., `/lovelace/0`)
- `viewport`: Object with `width` and `height`
- `interval`: Refresh interval in seconds
- Optional: `format`, `eink`, `invert`, `zoom`, `rotate`, `lang`, `theme`, `dark`, `wait`

See `screenshots-example.json` for full example.

## Home Assistant Add-on Configuration

**Required Options** (config.yaml):
- `access_token`: Long-lived access token from Home Assistant

**Optional Options**:
- `home_assistant_url`: Override default `http://homeassistant:8123` (useful for SSL/custom ports)

**Screenshots Configuration**:
- Must create `/config/screenshots.json` defining what to capture and intervals
- See README for detailed configuration schema

**Watchdog**: Enable in Home Assistant supervisor to auto-restart on browser launch failures

## Code Patterns

**Environment Detection**:
```javascript
const isAddOn = optionsFile === "/data/options.json";
```
Used throughout to adjust behavior (wait times, URLs, browser args, output paths) between dev and production

**Busy Flag Pattern**:
`Browser` class uses `this.busy` to serialize operations and prevent concurrent page manipulations:
```javascript
if (this.busy) throw new Error("Browser is busy");
this.busy = true;
try { /* work */ } finally { this.busy = false; }
```

**Scheduler Job Management**:
Each screenshot config becomes a scheduled job with independent `setInterval` timer stored in `jobs` Map

## Performance Considerations
- Home Assistant Green: ~10s cold start, ~0.6s same-page, ~1.5s different page
- Puppeteer args optimized for low-end devices (see screenshot.js:16-52)
- `--enable-low-end-device-mode` added when running as add-on
- Sharp library used for efficient image processing
- Single browser instance shared across all scheduled jobs
- Browser stays alive for entire scheduler lifetime (no cleanup timers)

## Dependencies
- **puppeteer** (^24.26.1): Chromium automation
- **sharp** (^0.34.4): High-performance image processing
- **Node.js 23.x**: Runtime (installed from NodeSource in Dockerfile)
- **Debian Bullseye**: Base container image
- **Chromium**: Browser engine (system package)
- **fonts-noto-cjk**: CJK font support for Korean, Japanese, Chinese

## Version Management
- Version tracked in `puppet/config.yaml`
- Current: 2.0.0 (scheduler-based architecture)
- Repository metadata: `repository.json` at root

## Architecture Changes in v2.0.0
- **Removed**: HTTP server (http.js), RequestHandler class, port 10000
- **Added**: Scheduler (scheduler.js), FileManager (file-manager.js), screenshot configuration system
- **Changed**: Browser lifecycle (no automatic cleanup), file-based output instead of HTTP responses
- **Migration**: Users must create `/config/screenshots.json` and access images via `/local/screenshots/` URLs
