import { readFileSync, existsSync } from "fs";
import { Browser } from "./screenshot.js";
import { FileManager } from "./file-manager.js";
import { hassUrl, hassToken, isAddOn } from "./const.js";
import { logger } from "./logger.js";

/**
 * Manages scheduled screenshot jobs
 */
class ScreenshotScheduler {
  constructor(configPath, browser, fileManager) {
    this.configPath = configPath;
    this.browser = browser;
    this.fileManager = fileManager;
    this.jobs = new Map();
    this.isShuttingDown = false;
    this.offHours = null; // { start: "HH:MM", end: "HH:MM" }
  }

  /**
   * Check if current time is within off-hours window
   * @returns {boolean} true if currently in off-hours (screenshots should be skipped)
   */
  isOffHours() {
    if (!this.offHours) {
      return false;
    }

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Parse start and end times
    const [startHour, startMin] = this.offHours.start.split(':').map(Number);
    const [endHour, endMin] = this.offHours.end.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    // Handle cases where off-hours spans midnight
    if (startMinutes <= endMinutes) {
      // Same day range (e.g., 09:00 - 17:00)
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // Spans midnight (e.g., 22:00 - 06:00)
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  }

  /**
   * Load and validate configuration
   */
  loadConfig() {
    let config;

    // If configPath is an object, it's already loaded from options
    if (typeof this.configPath === 'object') {
      config = this.configPath;
    } else {
      // Load from file (for development/backwards compatibility)
      if (!existsSync(this.configPath)) {
        throw new Error(`Configuration file not found: ${this.configPath}`);
      }
      const configData = readFileSync(this.configPath, "utf8");
      config = JSON.parse(configData);
    }

    if (!config.screenshots || !Array.isArray(config.screenshots)) {
      throw new Error(
        'Configuration must contain a "screenshots" array property',
      );
    }

    // Validate and store off-hours configuration if present
    if (config.off_hours) {
      if (!config.off_hours.start || !config.off_hours.end) {
        throw new Error('off_hours must contain both "start" and "end" properties');
      }

      const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
      if (!timeRegex.test(config.off_hours.start)) {
        throw new Error(`Invalid off_hours start time: ${config.off_hours.start} (must be HH:MM format)`);
      }
      if (!timeRegex.test(config.off_hours.end)) {
        throw new Error(`Invalid off_hours end time: ${config.off_hours.end} (must be HH:MM format)`);
      }

      this.offHours = {
        start: config.off_hours.start,
        end: config.off_hours.end,
      };

      logger.info(`Off-hours configured: ${this.offHours.start} - ${this.offHours.end}`);
    }

    // Validate and normalize each screenshot config
    config.screenshots.forEach((screenshot, index) => {
      if (!screenshot.name) {
        throw new Error(`Screenshot at index ${index} missing required "name"`);
      }
      if (!screenshot.path) {
        throw new Error(
          `Screenshot "${screenshot.name}" missing required "path"`,
        );
      }

      // Normalize viewport: support both {width, height} and separate width/height fields
      if (!screenshot.viewport) {
        if (screenshot.width && screenshot.height) {
          screenshot.viewport = {
            width: screenshot.width,
            height: screenshot.height
          };
        } else {
          throw new Error(
            `Screenshot "${screenshot.name}" missing required "viewport" or "width"/"height"`,
          );
        }
      }

      if (!screenshot.viewport.width || !screenshot.viewport.height) {
        throw new Error(
          `Screenshot "${screenshot.name}" viewport missing width or height`,
        );
      }

      if (!screenshot.interval || screenshot.interval < 1) {
        throw new Error(
          `Screenshot "${screenshot.name}" missing or invalid "interval" (must be >= 1 second)`,
        );
      }
    });

    return config;
  }

  /**
   * Capture a single screenshot based on config
   */
  async captureScreenshot(screenshotConfig) {
    const { name } = screenshotConfig;

    // Check if currently in off-hours
    if (this.isOffHours()) {
      logger.debug(`Skipping "${name}" - currently in off-hours (${this.offHours.start} - ${this.offHours.end})`);
      return { success: false, skipped: true, reason: 'off-hours' };
    }

    try {
      logger.info(`Capturing "${name}" from ${screenshotConfig.path}`);
      const start = Date.now();

      // Prepare request parameters (ensure types are correct)
      const requestParams = {
        pagePath: screenshotConfig.path,
        viewport: {
          width: parseInt(screenshotConfig.viewport.width),
          height: parseInt(screenshotConfig.viewport.height),
        },
        extraWait: screenshotConfig.wait ? parseInt(screenshotConfig.wait) : undefined,
        einkColors: screenshotConfig.eink ? parseInt(screenshotConfig.eink) : undefined,
        invert: screenshotConfig.invert || false,
        zoom: screenshotConfig.zoom ? parseFloat(screenshotConfig.zoom) : 1,
        format: screenshotConfig.format || "png",
        rotate: screenshotConfig.rotate ? parseInt(screenshotConfig.rotate) : undefined,
        lang: screenshotConfig.lang,
        theme: screenshotConfig.theme,
        dark: screenshotConfig.dark || false,
      };

      // Navigate and screenshot atomically to prevent race conditions
      const screenshotResult =
        await this.browser.navigateAndScreenshot(requestParams);

      // Save to disk
      const savedPath = this.fileManager.saveScreenshot(
        name,
        screenshotResult.image,
        requestParams.format,
        requestParams.einkColors,
        false, // keepHistory - set to true if you want timestamped copies
      );

      const localUrl = this.fileManager.getLocalUrl(
        name,
        requestParams.format,
        requestParams.einkColors,
      );

      const totalTime = Date.now() - start;
      logger.info(`✓ "${name}" saved to ${savedPath} (${totalTime}ms)`);
      logger.info(`  Access at: ${localUrl}`);

      return { success: true, path: savedPath, url: localUrl };
    } catch (err) {
      logger.error(`✗ Failed to capture "${name}":`, err.message);
      logger.debug("Stack trace:", err.stack);
      return { success: false, error: err.message };
    }
  }

  /**
   * Schedule a recurring screenshot job
   */
  scheduleJob(screenshotConfig, startupDelayMs = 0) {
    const { name, interval } = screenshotConfig;

    if (this.jobs.has(name)) {
      logger.warn(`Job "${name}" already scheduled, skipping duplicate`);
      return;
    }

    logger.info(`Scheduled "${name}" every ${interval}s → ${screenshotConfig.path}`);

    // Capture with optional startup delay to stagger multiple jobs
    if (startupDelayMs > 0) {
      setTimeout(() => {
        if (!this.isShuttingDown) {
          this.captureScreenshot(screenshotConfig);
        }
      }, startupDelayMs);
    } else {
      this.captureScreenshot(screenshotConfig);
    }

    // Schedule recurring captures
    const intervalMs = interval * 1000;
    const timerId = setInterval(() => {
      if (!this.isShuttingDown) {
        this.captureScreenshot(screenshotConfig);
      }
    }, intervalMs);

    this.jobs.set(name, {
      config: screenshotConfig,
      timerId,
    });
  }

  /**
   * Start all scheduled jobs
   */
  start() {
    logger.info("Starting Automated Puppet Scheduler");

    try {
      const config = this.loadConfig();
      logger.info(`Loaded ${config.screenshots.length} screenshot configuration(s)`);

      // Schedule each screenshot with staggered startup delays
      // This prevents "Browser is busy" errors when multiple screenshots
      // are configured with the same interval
      const STAGGER_DELAY = 2000; // 2 seconds between each initial capture
      config.screenshots.forEach((screenshot, index) => {
        const startupDelay = index * STAGGER_DELAY;
        this.scheduleJob(screenshot, startupDelay);
      });

      logger.info(`All jobs scheduled successfully`);
    } catch (err) {
      logger.error("Failed to start scheduler:", err.message);
      throw err;
    }
  }

  /**
   * Stop all scheduled jobs and cleanup
   */
  async stop() {
    logger.info("Stopping scheduler");
    this.isShuttingDown = true;

    // Clear all intervals
    for (const [name, job] of this.jobs.entries()) {
      clearInterval(job.timerId);
    }

    this.jobs.clear();

    // Cleanup browser
    await this.browser.cleanup();
    logger.info("Scheduler stopped");
  }
}

/**
 * Load configuration from add-on options or file
 */
function loadConfiguration() {
  // Try to load from add-on options first
  const optionsFile = isAddOn ? "/data/options.json" : null;

  if (optionsFile && existsSync(optionsFile)) {
    const options = JSON.parse(readFileSync(optionsFile, "utf8"));
    if (options.screenshots && Array.isArray(options.screenshots)) {
      logger.info("Using configuration from add-on options");
      const config = { screenshots: options.screenshots };
      // Include off_hours if configured
      if (options.off_hours) {
        config.off_hours = options.off_hours;
      }
      return config;
    }
  }

  // Fall back to file-based configuration (for development)
  const configPaths = [
    "./screenshots-dev.json",
    "./screenshots.json",
    "/data/screenshots.json",
  ];

  const configPath = configPaths.find(existsSync);

  if (!configPath) {
    logger.error("No screenshots configuration found.");
    logger.error("Please configure screenshots in the add-on options or create one of:");
    configPaths.forEach((path) => logger.error(`  - ${path}`));
    logger.error("\nFor development, copy screenshots-example.json to screenshots-dev.json");
    process.exit(1);
  }

  logger.info(`Using configuration file: ${configPath}`);
  return configPath;
}

/**
 * Main entry point
 */
async function main() {
  // Clear console on startup for clean logs
  console.clear();

  logger.info("=== Automated Puppet ===");

  // Load configuration
  const config = loadConfiguration();

  // Determine output path
  const outputPath = isAddOn ? "/config/www/screenshots" : "./output";
  logger.info(`Output directory: ${outputPath}`);

  // Initialize components
  const browser = new Browser(hassUrl, hassToken);
  const fileManager = new FileManager(outputPath);
  const scheduler = new ScreenshotScheduler(config, browser, fileManager);

  // Handle graceful shutdown
  const shutdown = async () => {
    logger.info("Received shutdown signal");
    await scheduler.stop();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // Start scheduler
  try {
    scheduler.start();
  } catch (err) {
    logger.error("Fatal error:", err.message);
    process.exit(1);
  }
}

// Run the scheduler
main();
