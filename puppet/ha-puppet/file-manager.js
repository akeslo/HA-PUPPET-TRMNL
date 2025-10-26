import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { logger } from "./logger.js";

/**
 * Manages screenshot file storage in the Home Assistant /www directory
 */
export class FileManager {
  constructor(baseOutputPath = "/config/www/screenshots") {
    this.baseOutputPath = baseOutputPath;
    this.ensureDirectoryExists(this.baseOutputPath);
  }

  /**
   * Ensure a directory exists, creating it if necessary
   */
  ensureDirectoryExists(dirPath) {
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
      logger.debug(`Created directory: ${dirPath}`);
    }
  }

  /**
   * Get the file extension for a given format
   */
  getExtension(format, einkColors) {
    // BMP is used for e-ink when specified
    if (einkColors && format === "bmp") {
      return "bmp";
    }
    return format || "png";
  }

  /**
   * Save a screenshot to disk
   * @param {string} name - Screenshot name (used for folder organization)
   * @param {Buffer} imageBuffer - Image data
   * @param {string} format - Image format (png, jpeg, webp, bmp)
   * @param {number} einkColors - E-ink color count (optional)
   * @param {boolean} keepHistory - Whether to keep timestamped versions
   * @returns {string} Path where the file was saved
   */
  saveScreenshot(
    name,
    imageBuffer,
    format = "png",
    einkColors = undefined,
    keepHistory = false,
  ) {
    // Create folder for this screenshot
    const screenshotDir = join(this.baseOutputPath, name);
    this.ensureDirectoryExists(screenshotDir);

    const extension = this.getExtension(format, einkColors);

    // Always save as "latest" for easy access
    const latestPath = join(screenshotDir, `latest.${extension}`);
    writeFileSync(latestPath, imageBuffer);

    // Optionally save timestamped version for history
    if (keepHistory) {
      const timestamp = new Date()
        .toISOString()
        .replace(/:/g, "-")
        .replace(/\..+/, "");
      const timestampPath = join(screenshotDir, `${timestamp}.${extension}`);
      writeFileSync(timestampPath, imageBuffer);
    }

    return latestPath;
  }

  /**
   * Get the URL path for accessing a screenshot via Home Assistant
   * @param {string} name - Screenshot name
   * @param {string} format - Image format
   * @param {number} einkColors - E-ink color count (optional)
   * @returns {string} URL path relative to /local/
   */
  getLocalUrl(name, format = "png", einkColors = undefined) {
    const extension = this.getExtension(format, einkColors);
    return `/local/screenshots/${name}/latest.${extension}`;
  }
}
