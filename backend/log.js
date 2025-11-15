const timestamp = () => new Date().toISOString();

function formatMessage(tag, level, message, metadata) {
  const base = `[${tag}] [${level}] ${message}`;
  if (!metadata || Object.keys(metadata).length === 0) {
    return `${timestamp()} ${base}`;
  }
  return `${timestamp()} ${base} ${JSON.stringify(metadata)}`;
}

export function logInfo(tag, message, metadata = undefined) {
  console.log(formatMessage(tag, 'INFO', message, metadata));
}

export function logWarn(tag, message, metadata = undefined) {
  console.warn(formatMessage(tag, 'WARN', message, metadata));
}

export function logError(tag, message, metadata = undefined) {
  console.error(formatMessage(tag, 'ERROR', message, metadata));
}

export function logDebug(tag, message, metadata = undefined) {
  if (process.env.DEBUG !== 'true') {
    return;
  }
  console.debug(formatMessage(tag, 'DEBUG', message, metadata));
}
