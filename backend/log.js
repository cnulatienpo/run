/**
 * Lightweight logging helpers that provide consistent timestamped output
 * across the backend services.
 */

const timestamp = () => new Date().toISOString();

/**
 * Formats a structured log message with optional metadata payload.
 *
 * @param {string} tag Log category tag.
 * @param {string} level Log severity level.
 * @param {string} message Primary log message.
 * @param {Record<string, any>|undefined} metadata Additional metadata.
 * @returns {string} Formatted log string.
 */
function formatMessage(tag, level, message, metadata) {
  const base = `[${tag}] [${level}] ${message}`;
  if (!metadata || Object.keys(metadata).length === 0) {
    return `${timestamp()} ${base}`;
  }
  return `${timestamp()} ${base} ${JSON.stringify(metadata)}`;
}

/**
 * Emits an INFO level log message.
 *
 * @param {string} tag Log category.
 * @param {string} message Log message.
 * @param {Record<string, any>|undefined} metadata Optional metadata.
 */
export function logInfo(tag, message, metadata = undefined) {
  console.log(formatMessage(tag, 'INFO', message, metadata));
}

/**
 * Emits a WARN level log message.
 *
 * @param {string} tag Log category.
 * @param {string} message Log message.
 * @param {Record<string, any>|undefined} metadata Optional metadata.
 */
export function logWarn(tag, message, metadata = undefined) {
  console.warn(formatMessage(tag, 'WARN', message, metadata));
}

/**
 * Emits an ERROR level log message.
 *
 * @param {string} tag Log category.
 * @param {string} message Log message.
 * @param {Record<string, any>|undefined} metadata Optional metadata.
 */
export function logError(tag, message, metadata = undefined) {
  console.error(formatMessage(tag, 'ERROR', message, metadata));
}

/**
 * Emits a DEBUG level log message when DEBUG mode is enabled.
 *
 * @param {string} tag Log category.
 * @param {string} message Log message.
 * @param {Record<string, any>|undefined} metadata Optional metadata.
 */
export function logDebug(tag, message, metadata = undefined) {
  if (process.env.DEBUG !== 'true') {
    return;
  }
  console.debug(formatMessage(tag, 'DEBUG', message, metadata));
}
