# Automated Puppet - Scheduled Home Assistant Screenshots

Automatically capture screenshots of your Home Assistant dashboards on a schedule using Puppeteer. Screenshots are saved to the `/config/www/screenshots/` directory and are accessible via Home Assistant's local media system.

**This is a fork of the original Puppet add-on**, redesigned to run as a scheduled background process instead of an HTTP server. It can be installed alongside the original Puppet add-on via HACS.

[![Open your Home Assistant instance and show the dashboard of an add-on.](https://my.home-assistant.io/badges/supervisor_addon.svg)](https://my.home-assistant.io/redirect/supervisor_addon/?addon=a8d03a84_automated-puppet&repository_url=https%3A%2F%2Fgithub.com%2Fakeslo%2FHA-PUPPET-TRMNL)

You will need to create a long lived access token and add it as an add-on option.

Enable the watch dog option to restart the add-on when the browser fails to launch (happens sometimes, still investigating).

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
