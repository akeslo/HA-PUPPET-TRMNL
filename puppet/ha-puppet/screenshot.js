import puppeteer from "puppeteer";
import sharp from "sharp"; // Import sharp
import { BMPEncoder } from "./bmp.js";
import { debug, isAddOn, chromiumExecutable } from "./const.js";
import { CannotOpenPageError } from "./error.js";
import { logger } from "./logger.js";

const HEADER_HEIGHT = 56;

// These are JSON stringified values
const hassLocalStorageDefaults = {
  dockedSidebar: `"always_hidden"`,
  selectedTheme: `{"dark": false}`,
};

// From https://www.bannerbear.com/blog/ways-to-speed-up-puppeteer-screenshots/
const puppeteerArgs = [
  "--autoplay-policy=user-gesture-required",
  "--disable-background-networking",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-breakpad",
  "--disable-client-side-phishing-detection",
  "--disable-component-update",
  "--disable-default-apps",
  "--disable-dev-shm-usage",
  "--disable-domain-reliability",
  "--disable-extensions",
  "--disable-features=AudioServiceOutOfProcess",
  "--disable-hang-monitor",
  "--disable-ipc-flooding-protection",
  "--disable-notifications",
  "--disable-offer-store-unmasked-wallet-cards",
  "--disable-popup-blocking",
  "--disable-print-preview",
  "--disable-prompt-on-repost",
  "--disable-renderer-backgrounding",
  "--disable-setuid-sandbox",
  "--disable-speech-api",
  "--disable-sync",
  "--hide-scrollbars",
  "--ignore-gpu-blacklist",
  "--metrics-recording-only",
  "--mute-audio",
  "--no-default-browser-check",
  "--no-first-run",
  "--no-pings",
  "--no-sandbox",
  "--no-zygote",
  "--password-store=basic",
  "--use-gl=swiftshader",
  "--use-mock-keychain",
];
if (isAddOn) {
  puppeteerArgs.push("--enable-low-end-device-mode");
}

export class Browser {
  constructor(homeAssistantUrl, token) {
    this.homeAssistantUrl = homeAssistantUrl;
    this.token = token;
    this.browser = undefined;
    this.page = undefined;
    this.busy = false;
    this.queue = [];
    this.processing = false;

    // The last path we requested a screenshot for
    // We store this instead of using page.url() because panels can redirect
    // users, ie / -> /lovelace/0.
    this.lastRequestedPath = undefined;
    this.lastRequestedLang = undefined;
    this.lastRequestedTheme = undefined;
    this.lastRequestedDarkMode = undefined;
  }

  async cleanup() {
    const { browser, page } = this;

    if (!this.browser && !this.page) {
      return;
    }

    this.page = undefined;
    this.browser = undefined;
    this.lastRequestedPath = undefined;
    this.lastRequestedLang = undefined;
    this.lastRequestedTheme = undefined;
    this.lastRequestedDarkMode = undefined;

    try {
      if (page) {
        await page.close();
      }
    } catch (err) {
      logger.debug("Error closing page during cleanup:", err);
    }

    try {
      if (browser) {
        await browser.close();
      }
    } catch (err) {
      logger.debug("Error closing browser during cleanup:", err);
    }

    logger.debug("Browser closed");
  }

  /**
   * Add a task to the queue
   */
  async enqueue(taskFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ taskFn, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Process tasks from the queue sequentially
   */
  async processQueue() {
    // If already processing, let that execution handle the queue
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const { taskFn, resolve, reject } = this.queue.shift();
      try {
        const result = await taskFn();
        resolve(result);
      } catch (err) {
        reject(err);
      }
    }

    this.processing = false;
  }

  async getPage() {
    if (this.page) {
      return this.page;
    }

    logger.info("Starting Chromium browser");
    // We don't catch these errors on purpose, as we're
    // not able to recover once the app fails to start.
    const browser = await puppeteer.launch({
      headless: "shell",
      executablePath: chromiumExecutable,
      args: puppeteerArgs,
    });
    const page = await browser.newPage();

    // Route critical errors to log (suppress verbose messages)
    page
      .on("error", (err) => logger.error("Browser error:", err.message))
      .on("pageerror", ({ message }) => {
        // Suppress common Home Assistant JS errors that don't affect screenshots
        const messageStr = String(message);
        const suppressedErrors = [
          'undefined',
          'Object',
          'Failed to set an indexed property',
          'CSSStyleDeclaration'
        ];
        const shouldSuppress = suppressedErrors.some(err => messageStr.includes(err));
        if (!shouldSuppress) {
          logger.error("Page error:", message);
        } else {
          logger.debug("Page error (suppressed):", message);
        }
      })
      .on("requestfailed", (request) =>
        logger.debug(
          `Request failed: ${request.failure().errorText} ${request.url()}`,
        ),
      );

    this.browser = browser;
    this.page = page;
    return this.page;
  }

  /**
   * Atomic operation: navigate AND screenshot in one queue item
   * This prevents race conditions where other operations slip between nav and screenshot
   */
  async navigateAndScreenshot(params) {
    return this.enqueue(async () => {
      logger.info(`[ATOMIC] Starting atomic navigate+screenshot operation`);
      await this._navigatePage(params);
      const result = await this._screenshotPage(params);
      logger.info(`[ATOMIC] Atomic operation complete`);
      return result;
    });
  }

  /**
   * Public method that enqueues navigation
   */
  async navigatePage(params) {
    return this.enqueue(() => this._navigatePage(params));
  }

  /**
   * Direct navigation without queueing (for use within already-queued operations)
   */
  async navigatePageDirect(params) {
    return this._navigatePage(params);
  }

  async _navigatePage({
    pagePath,
    viewport,
    extraWait,
    zoom,
    lang,
    theme,
    dark,
  }) {
    const start = new Date();
    const headerHeight = Math.round(HEADER_HEIGHT * zoom);

    logger.info(`[NAV] Request to navigate to: ${pagePath}, current lastRequestedPath: ${this.lastRequestedPath}`);

    try {
      const page = await this.getPage();

      // We add 56px to the height to account for the header
      // We'll cut that off from the screenshot
      viewport.height += headerHeight;

      const curViewport = page.viewport();

      if (
        !curViewport ||
        curViewport.width !== viewport.width ||
        curViewport.height !== viewport.height
      ) {
        await page.setViewport(viewport);
      }

      let defaultWait = isAddOn ? 2000 : 1000;
      let openedNewPage = false;
      let changedPath = false;

      // If we're still on about:blank, navigate to HA UI
      if (this.lastRequestedPath === undefined) {
        openedNewPage = true;

        // Ensure we have tokens when we open the UI
        const clientId = new URL("/", this.homeAssistantUrl).toString(); // http://homeassistant.local:8123/
        const hassUrl = clientId.substring(0, clientId.length - 1); // http://homeassistant.local:8123
        const browserLocalStorage = {
          ...hassLocalStorageDefaults,
          hassTokens: JSON.stringify({
            access_token: this.token,
            token_type: "Bearer",
            expires_in: 1800,
            hassUrl,
            clientId,
            expires: 9999999999999,
            refresh_token: "",
          }),
        };
        const evaluateIdentifier = await page.evaluateOnNewDocument(
          (hassLocalStorage) => {
            for (const [key, value] of Object.entries(hassLocalStorage)) {
              localStorage.setItem(key, value);
            }
          },
          browserLocalStorage,
        );

        // Open the HA UI
        const pageUrl = new URL(pagePath, this.homeAssistantUrl).toString();
        const response = await page.goto(pageUrl);
        if (!response.ok()) {
          throw new CannotOpenPageError(response.status(), pageUrl);
        }
        page.removeScriptToEvaluateOnNewDocument(evaluateIdentifier.identifier);

        // Launching browser is slow inside the add-on, give it extra time
        // Cold start needs more time for cards to render
        if (isAddOn) {
          defaultWait += 5000;
        }
      } else if (this.lastRequestedPath !== pagePath) {
        changedPath = true;

        // Navigate to the new page with a full URL reload
        // The event-based navigation wasn't reliably changing Lovelace views
        const pageUrl = new URL(pagePath, this.homeAssistantUrl).toString();
        logger.debug(`Navigating from ${this.lastRequestedPath} to ${pagePath}`);

        // Re-inject authentication tokens before navigation since page.goto() clears localStorage
        const clientId = new URL("/", this.homeAssistantUrl).toString();
        const hassUrl = clientId.substring(0, clientId.length - 1);
        const browserLocalStorage = {
          ...hassLocalStorageDefaults,
          hassTokens: JSON.stringify({
            access_token: this.token,
            token_type: "Bearer",
            expires_in: 1800,
            hassUrl,
            clientId,
            expires: 9999999999999,
            refresh_token: "",
          }),
        };
        const evaluateIdentifier = await page.evaluateOnNewDocument(
          (hassLocalStorage) => {
            for (const [key, value] of Object.entries(hassLocalStorage)) {
              localStorage.setItem(key, value);
            }
          },
          browserLocalStorage,
        );

        const response = await page.goto(pageUrl, { waitUntil: 'networkidle0' });
        if (!response.ok()) {
          throw new CannotOpenPageError(response.status(), pageUrl);
        }

        page.removeScriptToEvaluateOnNewDocument(evaluateIdentifier.identifier);

        // Full page reload needs more time
        defaultWait = isAddOn ? 3000 : 2000;
      } else {
        // We are already on the correct page
        defaultWait = 0;
      }

      this.lastRequestedPath = pagePath;
      logger.info(`[NAV] Updated lastRequestedPath to: ${pagePath}`);

      // Dismiss any dashboard update avaiable toasts
      if (
        !openedNewPage &&
        (await page.evaluate((zoomLevel) => {
          // Set zoom level
          document.body.style.zoom = zoomLevel;

          const haEl = document.querySelector("home-assistant");
          if (!haEl) return false;
          const notifyEl = haEl.shadowRoot?.querySelector(
            "notification-manager",
          );
          if (!notifyEl) return false;
          const actionEl = notifyEl.shadowRoot.querySelector(
            "ha-toast *[slot=action]",
          );
          if (!actionEl) return false;
          actionEl.click();
          return true;
        }, zoom))
      ) {
        // If we dismissed a toast, let's wait a bit longer
        defaultWait += 1000;
      } else {
        // Set zoom level
        await page.evaluate((zoomLevel) => {
          document.body.style.zoom = zoomLevel;
        }, zoom);
      }

      // Wait for the page to be loaded.
      try {
        await page.waitForFunction(
          () => {
            const haEl = document.querySelector("home-assistant");
            if (!haEl) return false;
            const mainEl = haEl.shadowRoot?.querySelector(
              "home-assistant-main",
            );
            if (!mainEl) return false;
            const panelResolver = mainEl.shadowRoot?.querySelector(
              "partial-panel-resolver",
            );
            if (!panelResolver || panelResolver._loading) {
              return false;
            }

            const panel = panelResolver.children[0];
            if (!panel) return false;

            return !("_loading" in panel) || !panel._loading;
          },
          {
            timeout: 15000,
            polling: 100,
          },
        );
      } catch (err) {
        console.log("Timeout waiting for HA to finish loading");
      }

      // If we changed pages, add extra delay to ensure new content is rendered
      if (changedPath) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Update language
      // Should really be done via localStorage.selectedLanguage
      // but that doesn't seem to work
      if (lang !== this.lastRequestedLang) {
        await page.evaluate((newLang) => {
          document
            .querySelector("home-assistant")
            ._selectLanguage(newLang, false);
        }, lang || "en");
        this.lastRequestedLang = lang;
        defaultWait += 1000;
      }

      // Update theme and dark mode
      if (
        theme !== this.lastRequestedTheme ||
        dark !== this.lastRequestedDarkMode
      ) {
        await page.evaluate(
          ({ theme, dark }) => {
            document.querySelector("home-assistant").dispatchEvent(
              new CustomEvent("settheme", {
                detail: { theme, dark },
              }),
            );
          },
          { theme: theme || "", dark },
        );
        this.lastRequestedTheme = theme;
        this.lastRequestedDarkMode = dark;
        defaultWait += 500;
      }

      // wait for the work to be done.
      // Not sure yet how to decide that?
      if (extraWait === undefined) {
        extraWait = defaultWait;
      }
      if (extraWait) {
        await new Promise((resolve) => setTimeout(resolve, extraWait));
      }

      const end = Date.now();
      logger.info(`[NAV] Navigation complete, took ${end - start}ms`);
      return { time: end - start };
    } catch (err) {
      throw err;
    }
  }

  /**
   * Public method that enqueues screenshot
   */
  async screenshotPage(params) {
    logger.info(`[QUEUE] Enqueueing screenshot request`);
    return this.enqueue(() => this._screenshotPage(params));
  }

  /**
   * Direct screenshot without queueing (for use within already-queued operations)
   */
  async screenshotPageDirect(params) {
    return this._screenshotPage(params);
  }

  async _screenshotPage({ viewport, einkColors, invert, zoom, format, rotate }) {
    const start = new Date();
    const headerHeight = Math.round(HEADER_HEIGHT * zoom);

    logger.info(`[SCREENSHOT] Taking screenshot, current lastRequestedPath: ${this.lastRequestedPath}`);

    try {
      const page = await this.getPage();

      // If eink processing is requested, we need PNG input for sharp.
      // Otherwise, use the requested format.
      const screenshotType = einkColors || format == "bmp" ? "png" : format;

      let image = await page.screenshot({
        type: screenshotType,
        clip: {
          x: 0,
          y: headerHeight,
          width: viewport.width,
          height: viewport.height - headerHeight,
        },
      });

      let sharpInstance = sharp(image);

      if (rotate) {
        sharpInstance = sharpInstance.rotate(rotate);
      }

      // Manually handle color conversion for 2 colors
      if (einkColors === 2) {
        sharpInstance = sharpInstance.threshold(220, {
          greyscale: true,
        });
        if (invert) {
          sharpInstance = sharpInstance.negate({
            alpha: false,
          });
        }
      }

      // If eink processing was requested, output PNG with specified colors
      if (einkColors) {
        if (einkColors === 2) {
          sharpInstance = sharpInstance.toColourspace("b-w");
        }
        if (format == "bmp") {
          sharpInstance = sharpInstance.raw();

          const { data, info } = await sharpInstance.toBuffer({
            resolveWithObject: true,
          });
          let bitsPerPixel = 8;
          if (einkColors === 2) {
            bitsPerPixel = 1;
          } else if (einkColors === 4) {
            bitsPerPixel = 2;
          } else if (einkColors === 16) {
            bitsPerPixel = 4;
          }
          const bmpEncoder = new BMPEncoder(
            info.width,
            info.height,
            bitsPerPixel,
          );
          image = bmpEncoder.encode(data);
        } else if (format === "jpeg") {
          sharpInstance = sharpInstance.jpeg();
          image = await sharpInstance.toBuffer();
        } else if (format === "webp") {
          sharpInstance = sharpInstance.webp();
          image = await sharpInstance.toBuffer();
        } else {
          sharpInstance = sharpInstance.png({
            colours: einkColors,
          });
          image = await sharpInstance.toBuffer();
        }
      }
      // Otherwise, output in the requested format
      else if (format === "jpeg") {
        sharpInstance = sharpInstance.jpeg();
        image = await sharpInstance.toBuffer();
      } else if (format === "webp") {
        sharpInstance = sharpInstance.webp();
        image = await sharpInstance.toBuffer();
      } else if (format === "bmp") {
        sharpInstance = sharpInstance.raw();
        const { data, info } = await sharpInstance.toBuffer({
          resolveWithObject: true,
        });
        const bmpEncoder = new BMPEncoder(info.width, info.height, 24);
        image = bmpEncoder.encode(data);
      } else {
        sharpInstance = sharpInstance.png();
        image = await sharpInstance.toBuffer();
      }

      const end = Date.now();
      logger.info(`[SCREENSHOT] Screenshot complete, took ${end - start}ms`);
      return {
        image,
        time: end - start,
      };
    } catch (err) {
      // trigger a full page navigation on next request
      this.lastRequestedPath = undefined;
      throw err;
    }
  }
}
