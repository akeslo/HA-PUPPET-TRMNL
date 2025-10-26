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
      try {
        mkdirSync(dirPath, { recursive: true });
        logger.info(`Created directory: ${dirPath}`);
      } catch (err) {
        logger.error(`Failed to create directory ${dirPath}:`, err.message);
        throw new Error(`Cannot create directory: ${dirPath} - ${err.message}`);
      }
    } else {
      logger.debug(`Directory exists: ${dirPath}`);
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

    try {
      writeFileSync(latestPath, imageBuffer);
      logger.debug(`Wrote ${imageBuffer.length} bytes to ${latestPath}`);
    } catch (err) {
      logger.error(`Failed to write file ${latestPath}:`, err.message);
      throw new Error(`Cannot write screenshot file: ${err.message}`);
    }

    // Optionally save timestamped version for history
    if (keepHistory) {
      const timestamp = new Date()
        .toISOString()
        .replace(/:/g, "-")
        .replace(/\..+/, "");
      const timestampPath = join(screenshotDir, `${timestamp}.${extension}`);
      try {
        writeFileSync(timestampPath, imageBuffer);
      } catch (err) {
        logger.warn(`Failed to write history file:`, err.message);
      }
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
