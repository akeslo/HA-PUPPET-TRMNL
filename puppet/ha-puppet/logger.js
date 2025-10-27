/**
 * Logging utility with timestamps
 */

function timestamp() {
  // Use local timezone instead of UTC
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
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
