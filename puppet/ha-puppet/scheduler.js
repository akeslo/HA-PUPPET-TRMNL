import { readFileSync, existsSync } from "fs";
import { Browser } from "./screenshot.js";
import { FileManager } from "./file-manager.js";
import { hassUrl, hassToken, isAddOn } from "./const.js";

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
  }

  /**
   * Load and validate configuration
   */
  loadConfig() {
    if (!existsSync(this.configPath)) {
      throw new Error(`Configuration file not found: ${this.configPath}`);
    }

    const configData = readFileSync(this.configPath, "utf8");
    const config = JSON.parse(configData);

    if (!config.screenshots || !Array.isArray(config.screenshots)) {
      throw new Error(
        'Configuration must contain a "screenshots" array property',
      );
    }

    // Validate each screenshot config
    config.screenshots.forEach((screenshot, index) => {
      if (!screenshot.name) {
        throw new Error(`Screenshot at index ${index} missing required "name"`);
      }
      if (!screenshot.path) {
        throw new Error(
          `Screenshot "${screenshot.name}" missing required "path"`,
        );
      }
      if (!screenshot.viewport || !screenshot.viewport.width || !screenshot.viewport.height) {
        throw new Error(
          `Screenshot "${screenshot.name}" missing required "viewport" with width and height`,
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
    const requestId = `${name}-${Date.now()}`;

    try {
      console.log(requestId, `Starting capture: ${screenshotConfig.path}`);
      const start = Date.now();

      // Prepare request parameters
      const requestParams = {
        pagePath: screenshotConfig.path,
        viewport: {
          width: screenshotConfig.viewport.width,
          height: screenshotConfig.viewport.height,
        },
        extraWait: screenshotConfig.wait,
        einkColors: screenshotConfig.eink,
        invert: screenshotConfig.invert || false,
        zoom: screenshotConfig.zoom || 1,
        format: screenshotConfig.format || "png",
        rotate: screenshotConfig.rotate,
        lang: screenshotConfig.lang,
        theme: screenshotConfig.theme,
        dark: screenshotConfig.dark || false,
      };

      // Navigate to page
      const navigateResult = await this.browser.navigatePage(requestParams);
      console.debug(requestId, `Navigated in ${navigateResult.time} ms`);

      // Take screenshot
      const screenshotResult =
        await this.browser.screenshotPage(requestParams);
      console.debug(requestId, `Screenshot in ${screenshotResult.time} ms`);

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
      console.log(
        requestId,
        `Completed in ${totalTime}ms → ${savedPath} (accessible at ${localUrl})`,
      );

      return { success: true, path: savedPath, url: localUrl };
    } catch (err) {
      console.error(requestId, `Failed to capture screenshot:`, err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Schedule a recurring screenshot job
   */
  scheduleJob(screenshotConfig) {
    const { name, interval } = screenshotConfig;

    if (this.jobs.has(name)) {
      console.warn(`Job "${name}" already scheduled, skipping duplicate`);
      return;
    }

    console.log(
      `Scheduling "${name}" every ${interval} seconds (${screenshotConfig.path})`,
    );

    // Capture immediately on startup
    this.captureScreenshot(screenshotConfig);

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
    console.log("Starting Screenshot Scheduler");

    try {
      const config = this.loadConfig();
      console.log(
        `Loaded configuration with ${config.screenshots.length} screenshot(s)`,
      );

      // Schedule each screenshot
      config.screenshots.forEach((screenshot) => {
        this.scheduleJob(screenshot);
      });

      console.log(`Successfully scheduled ${this.jobs.size} job(s)`);
    } catch (err) {
      console.error("Failed to start scheduler:", err);
      throw err;
    }
  }

  /**
   * Stop all scheduled jobs and cleanup
   */
  async stop() {
    console.log("Stopping Screenshot Scheduler");
    this.isShuttingDown = true;

    // Clear all intervals
    for (const [name, job] of this.jobs.entries()) {
      clearInterval(job.timerId);
      console.log(`Stopped job: ${name}`);
    }

    this.jobs.clear();

    // Cleanup browser
    await this.browser.cleanup();
    console.log("Scheduler stopped");
  }
}

/**
 * Main entry point
 */
async function main() {
  // Determine config file path
  const configPaths = [
    "./screenshots-dev.json",
    "./screenshots.json",
    "/data/screenshots.json",
  ];

  const configPath = configPaths.find(existsSync);

  if (!configPath) {
    console.error(
      "No screenshots configuration file found. Please create one of:",
    );
    configPaths.forEach((path) => console.error(`  - ${path}`));
    console.error(
      "\nFor development, copy screenshots-example.json to screenshots-dev.json",
    );
    process.exit(1);
  }

  console.log(`Using configuration: ${configPath}`);

  // Determine output path
  const outputPath = isAddOn ? "/config/www/screenshots" : "./output";
  console.log(`Screenshots will be saved to: ${outputPath}`);

  // Initialize components
  const browser = new Browser(hassUrl, hassToken);
  const fileManager = new FileManager(outputPath);
  const scheduler = new ScreenshotScheduler(configPath, browser, fileManager);

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log("\nReceived shutdown signal");
    await scheduler.stop();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // Start scheduler
  try {
    scheduler.start();
    console.log("Scheduler is running. Press Ctrl+C to stop.");
  } catch (err) {
    console.error("Fatal error:", err);
    process.exit(1);
  }
}

// Run the scheduler
main();
