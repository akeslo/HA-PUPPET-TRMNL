# Dashboard Scheduler

Automatically capture screenshots of your Home Assistant dashboards on a schedule. Screenshots are saved to the `/config/www/screenshots/` directory and are accessible via Home Assistant's local media system.

**Built with Puppeteer** for high-quality dashboard rendering. Perfect for e-ink displays, picture frames, and automated dashboard exports.

## Features

✨ **Scheduled Capture** - Automatically screenshot dashboards at custom intervals (10 seconds to 24 hours)
🎨 **E-ink Optimization** - Built-in color reduction (2-256 colors) for e-ink displays
📐 **Flexible Sizing** - Any resolution from 100x100 to 7680x4320 pixels
🔄 **Multiple Formats** - Export as PNG, JPEG, WebP, or BMP
🌍 **Multi-language** - Support for all Home Assistant languages
🎭 **Theme Support** - Apply any HA theme including custom e-ink themes
📁 **Local Storage** - Files saved to `/config/www/` for easy access
⚡ **Fast Updates** - Warm captures in under 1 second

[![Open your Home Assistant instance and show the dashboard of an add-on.](https://my.home-assistant.io/badges/supervisor_addon.svg)](https://my.home-assistant.io/redirect/supervisor_addon/?addon=a8d03a84_automated-puppet&repository_url=https%3A%2F%2Fgithub.com%2Fakeslo%2FHA-PUPPET-TRMNL)

## Quick Start

1. Install the add-on from this repository
2. Create a [long-lived access token](https://my.home-assistant.io/redirect/profile/) in Home Assistant
3. Configure the add-on with your token and desired screenshots
4. Start the add-on - screenshots will be automatically captured!
5. Access screenshots at `/local/screenshots/<name>/latest.png`

[![ESPHome device showing a screenshot of a Home Assistant dashboard](https://raw.githubusercontent.com/balloob/home-assistant-addons/main/puppet/example/screenshot.jpg)](./example/)

## Configuration

Configure the add-on through the **Configuration** tab in Home Assistant:

### Basic Settings

- **access_token**: Long-lived access token used to authenticate against Home Assistant. (Required)
- **home_assistant_url**: Base URL of your Home Assistant instance. Defaults to `http://homeassistant:8123`

### Screenshot Configuration

Define one or more screenshots to capture automatically. Click the **+** button to add screenshots.

**Each screenshot requires:**
- **name**: Unique identifier (used for folder/file naming, no spaces recommended)
- **path**: Home Assistant path to capture (e.g., `/lovelace/0`)
- **width**: Screenshot width in pixels (100-7680)
- **height**: Screenshot height in pixels (100-4320)
- **interval**: How often to capture in seconds (10-86400)

**Optional settings:**
- **format**: Output format - `png` (default), `jpeg`, `webp`, or `bmp`
- **eink**: Number of colors for e-ink displays (2, 4, 8, 16, or 256)
- **invert**: Invert colors (only for `eink: 2`)
- **zoom**: Zoom level (0.1-5.0, default: 1.0)
- **rotate**: Rotation angle - 90, 180, or 270 degrees
- **lang**: Language code (e.g., `en`, `nl`, `de`, `ko`, `ja`)
- **theme**: Home Assistant theme name (e.g., `Graphite E-ink Light`)
- **dark**: Enable dark mode
- **wait**: Extra wait time in milliseconds after page load (0-30000)

### Example Configuration

```yaml
access_token: "eyJ0eXAiOiJKV1QiLCJhbGc..."
home_assistant_url: "http://homeassistant:8123"
screenshots:
  - name: main-dashboard
    path: /lovelace/0
    width: 1920
    height: 1080
    interval: 300
    format: png
  - name: eink-display
    path: /lovelace/weather
    width: 800
    height: 480
    interval: 60
    format: png
    eink: 2
    theme: Graphite E-ink Light
```

## Usage

Once the add-on is running with a valid configuration:

1. Screenshots are automatically captured according to your configured intervals
2. Files are saved to `/config/www/screenshots/<name>/latest.<format>`
3. Each screenshot is accessible in Home Assistant at the URL: `/local/screenshots/<name>/latest.<format>`

### Accessing Screenshots

You can use the screenshots in:

**Picture cards:**
```yaml
type: picture
image: /local/screenshots/main-dashboard/latest.png
```

**ESPHome displays:**
```yaml
online_image:
  - id: dashboard_image
    format: PNG
    type: RGB
    url: http://homeassistant.local:8123/local/screenshots/eink-display/latest.png
```

**Automations and scripts:**
Reference the screenshot files in notifications, image processing, etc.

### E-ink Display Optimization

For e-ink displays, it's recommended to:
- Use `"eink": 2` for black and white displays
- Set a compatible theme like [Graphite E-ink Light](https://github.com/TilmanGriesel/graphite?tab=readme-ov-file#e-ink-themes)
- Use `"format": "png"` or `"format": "bmp"`
- Consider using `"invert": true` if your display requires inverted colors

## Performance Notes

Screenshot capture timing on Home Assistant Green:
- First screenshot (cold-start): ~10 seconds
- Same page (warm): ~0.6 seconds
- Different page navigation: ~1.5 seconds

The browser stays active between captures to minimize overhead.

## Proxmox

If you're running Home Assistant OS in a virtual machine under Proxmox, make sure the host type of your virtual machine is set to `host`.

## Local Development

For local testing outside of Home Assistant:

1. Copy `puppet/ha-puppet/screenshots-example.json` to `puppet/ha-puppet/screenshots-dev.json`
2. Edit the configuration with your desired screenshots
3. Copy `puppet/ha-puppet/options-dev.json.sample` to `puppet/ha-puppet/options-dev.json`
4. Add your Home Assistant URL and access token
5. Install dependencies: `cd puppet/ha-puppet && npm ci`
6. Run: `node scheduler.js`

Screenshots will be saved to `./output/` directory.

## Migration from HTTP Server Mode

If you previously used the HTTP server version of this add-on:

**Old method:** ESPHome devices fetched screenshots on-demand via HTTP
```yaml
url: http://X.X.X.X:10000/lovelace/0?viewport=800x480
```

**New method:** Screenshots are pre-generated and served via Home Assistant's built-in web server
```yaml
url: http://homeassistant.local:8123/local/screenshots/main-dashboard/latest.png
```

Benefits:
- No open ports or security concerns
- Faster response times (pre-rendered)
- Automatic scheduling
- Organized file storage
