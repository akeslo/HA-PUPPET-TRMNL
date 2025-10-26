# Quick Start Guide - Automated Puppet

## Installation

1. Add this repository to Home Assistant:
   - Go to **Supervisor** → **Add-on Store** → **⋮** (menu) → **Repositories**
   - Add: `https://github.com/akeslo/HA-PUPPET-TRMNL`

2. Install the **Automated Puppet** add-on

3. Go to the **Configuration** tab

## Configuration

### Step 1: Add Access Token

1. In Home Assistant, create a [long-lived access token](https://www.home-assistant.io/docs/authentication/#your-account-profile)
2. Paste it into the **access_token** field

### Step 2: Configure Screenshots

Click the **+** button under **screenshots** to add each screenshot you want to capture.

**Example configuration:**

```yaml
access_token: "eyJ0eXAiOiJKV1QiLCJhbGc..."
home_assistant_url: "http://homeassistant:8123"
screenshots:
  - name: living-room-dashboard
    path: /lovelace/living-room
    width: 1920
    height: 1080
    interval: 300
    format: png
  - name: eink-weather
    path: /lovelace/weather
    width: 800
    height: 480
    interval: 60
    format: png
    eink: 2
    theme: Graphite E-ink Light
```

### Step 3: Start the Add-on

Click **Save** and then **Start** in the add-on page.

### Step 4: Verify Screenshots

Check that screenshots are being created:
1. Go to **Settings** → **System** → **Storage** → **Media Browser**
2. Navigate to `local/screenshots/`
3. You should see folders for each screenshot name

Or check the add-on logs for confirmation messages.

## Using Screenshots

### In Lovelace Cards

```yaml
type: picture
image: /local/screenshots/living-room-dashboard/latest.png
```

### In ESPHome Displays

```yaml
online_image:
  - id: my_dashboard
    format: PNG
    type: RGB
    url: http://homeassistant.local:8123/local/screenshots/eink-weather/latest.png
    on_download_finished:
      - component.update: my_display
```

### In Automations

Reference the file path: `/config/www/screenshots/<name>/latest.<format>`

## Configuration Options

### Required Fields
- **name**: Unique identifier (use lowercase, no spaces)
- **path**: Dashboard path (e.g., `/lovelace/0`)
- **width**: Screenshot width in pixels (100-7680)
- **height**: Screenshot height in pixels (100-4320)
- **interval**: Update frequency in seconds (10-86400)

### Optional Fields
- **format**: `png` (default), `jpeg`, `webp`, `bmp`
- **eink**: Color count for e-ink (2, 4, 8, 16, 256)
- **invert**: Invert colors (boolean, only with `eink: 2`)
- **zoom**: Zoom level (0.1-5.0, default: 1.0)
- **rotate**: Rotation in degrees (90, 180, 270)
- **lang**: Language code (e.g., `en`, `nl`, `de`, `ko`, `ja`)
- **theme**: Theme name (e.g., `Graphite E-ink Light`)
- **dark**: Enable dark mode (boolean)
- **wait**: Extra milliseconds to wait after page load (0-30000)

## E-ink Display Tips

For best results with e-ink displays, configure:

```yaml
- name: eink-dashboard
  path: /dashboard-eink
  width: 800
  height: 480
  interval: 60
  format: png
  eink: 2
  theme: Graphite E-ink Light
  wait: 2000
```

**Recommended:**
- Use a high-contrast theme designed for e-ink
- Set `eink: 2` for black and white displays
- Use `format: "png"` or `format: "bmp"`
- Add extra `wait` time for slower dashboards
- Test with `invert: true` if colors appear reversed

## Troubleshooting

### Screenshots not appearing
1. Check add-on logs for errors
2. Verify `/config/screenshots.json` exists and is valid JSON
3. Ensure access token is valid
4. Check that dashboard paths are correct

### Browser fails to launch
- Enable Watchdog in add-on settings
- Check system resources (RAM/CPU)
- If using Proxmox, set VM host type to `host`

### Screenshots are blank or incomplete
- Increase `wait` time in screenshot config
- Check dashboard loads correctly in browser
- Verify theme is installed and available

### ESPHome can't fetch images
- Ensure URL uses `http://homeassistant.local:8123` (not add-on IP)
- Check network connectivity between devices
- Verify screenshot file exists at expected path

## File Locations

- **Configuration**: `/config/screenshots.json`
- **Screenshots**: `/config/www/screenshots/<name>/latest.<format>`
- **Access URL**: `/local/screenshots/<name>/latest.<format>`

## Advanced: Multiple Intervals

You can configure different update intervals for different screenshots:

```json
{
  "screenshots": [
    {
      "name": "frequent-updates",
      "path": "/lovelace/security",
      "viewport": {"width": 1920, "height": 1080},
      "interval": 30
    },
    {
      "name": "slow-updates",
      "path": "/lovelace/climate",
      "viewport": {"width": 1920, "height": 1080},
      "interval": 3600
    }
  ]
}
```

## Support

For issues and feature requests, visit:
https://github.com/akeslo/HA-PUPPET-TRMNL/issues

## Credits

This add-on is a fork of the original [Puppet](https://github.com/balloob/home-assistant-addons) add-on by Paulus Schoutsen, refactored to use scheduled screenshots instead of an HTTP server.
