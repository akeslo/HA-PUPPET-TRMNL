/**
 * Logging utility with timestamps
 */

function timestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

export const logger = {
  log: (...args) => console.log(`[${timestamp()}]`, ...args),
  info: (...args) => console.log(`[${timestamp()}] INFO:`, ...args),
  warn: (...args) => console.warn(`[${timestamp()}] WARN:`, ...args),
  error: (...args) => console.error(`[${timestamp()}] ERROR:`, ...args),
  debug: (...args) => {
    if (process.env.DEBUG === 'true') {
      console.log(`[${timestamp()}] DEBUG:`, ...args);
    }
  }
};
