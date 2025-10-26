# Refactor Summary: HTTP Server → Scheduled Background Process

## Overview
The Puppet add-on has been refactored from an HTTP server model to a scheduled background process that automatically captures and saves screenshots to disk.

## Architecture Changes

### What Was Removed
- ❌ HTTP server functionality (port 10000)
- ❌ RequestHandler class and request queue system
- ❌ Browser cleanup timers (30-second timeout)
- ❌ `keep_browser_open` configuration option
- ❌ Query parameter parsing from HTTP requests
- ❌ "Next request" preloading system

### What Was Added
- ✅ **scheduler.js**: Main entry point managing scheduled screenshot jobs
- ✅ **file-manager.js**: File storage management for `/config/www/screenshots/`
- ✅ **screenshots.json**: Configuration file defining what to capture and intervals
- ✅ **config-schema.json**: JSON schema for configuration validation
- ✅ **screenshots-example.json**: Example configuration template

### What Was Modified
- 🔄 **Dockerfile**: Changed CMD from `http.js` → `scheduler.js`
- 🔄 **config.yaml**: Removed port mapping and `keep_browser_open` option, bumped version to 2.0.0
- 🔄 **const.js**: Removed `keepBrowserOpen` export
- 🔄 **README.md**: Complete rewrite for scheduled mode usage
- 🔄 **CLAUDE.md**: Updated architecture documentation
- 🔄 **.gitignore**: Added `screenshots-dev.json`, `screenshots.json`, `output/`
- 🔄 **options-dev.json.sample**: Removed `keep_browser_open` field

## New Workflow

### Before (HTTP Server Mode)
```
ESPHome/Device → HTTP Request → Port 10000 → Generate Screenshot → Return Image
```

### After (Scheduled Mode)
```
Scheduler → Timer Fires → Generate Screenshot → Save to /config/www/screenshots/
ESPHome/Device → HTTP Request → Home Assistant → Serve from /local/screenshots/
```

## File Organization

Screenshots are now saved with this structure:
```
/config/www/screenshots/
├── main-dashboard/
│   └── latest.png
├── eink-display/
│   └── latest.png
└── tablet-view/
    └── latest.jpeg
```

Accessible via Home Assistant at:
- `/local/screenshots/main-dashboard/latest.png`
- `/local/screenshots/eink-display/latest.png`
- `/local/screenshots/tablet-view/latest.jpeg`

## Configuration Example

**Old Method (HTTP):**
```yaml
# ESPHome
url: http://X.X.X.X:10000/lovelace/0?viewport=800x480&eink=2
```

**New Method (Scheduled):**

1. Create `/config/screenshots.json`:
```json
{
  "screenshots": [
    {
      "name": "eink-display",
      "path": "/lovelace/0",
      "viewport": {"width": 800, "height": 480},
      "interval": 60,
      "eink": 2
    }
  ]
}
```

2. Update ESPHome:
```yaml
# ESPHome
url: http://homeassistant.local:8123/local/screenshots/eink-display/latest.png
```

## Benefits

1. **Security**: No open ports, no HTTP server exposure
2. **Performance**: Pre-rendered screenshots, no generation delay
3. **Reliability**: Screenshots continue generating even if devices are offline
4. **Organization**: Structured file storage with predictable URLs
5. **Simplicity**: Standard Home Assistant `/local/` URL scheme

## Migration Steps for Users

1. Update to new add-on version (2.0.0)
2. Create `/config/screenshots.json` with desired screenshot configurations
3. Update ESPHome/device configurations to use `/local/screenshots/` URLs
4. Restart add-on
5. Verify screenshots appear in `/config/www/screenshots/` directories

## Development Testing

**Local Development:**
```bash
cd puppet/ha-puppet
cp screenshots-example.json screenshots-dev.json
cp options-dev.json.sample options-dev.json
# Edit both files with your settings
npm ci
node scheduler.js
# Screenshots saved to ./output/
```

## Backward Compatibility

⚠️ **Breaking Change**: This is a major version bump (v2.0.0) because the HTTP API is completely removed. Users must migrate to the new configuration-based approach.

## Technical Implementation Details

### Scheduler System
- Uses `setInterval` for each screenshot job
- All jobs share single Browser instance
- Graceful shutdown on SIGTERM/SIGINT
- Browser stays alive for entire process lifetime
- Configuration validation on startup

### File Management
- Automatic directory creation
- Consistent `latest.<format>` naming
- Optional timestamped history (disabled by default)
- Format-aware file extensions

### Browser Management
- No automatic cleanup (lives with scheduler)
- Busy flag prevents concurrent operations
- Shared across all screenshot jobs
- Same navigation optimization as before
