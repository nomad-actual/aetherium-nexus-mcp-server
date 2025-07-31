import { pino, type Logger } from 'pino';

const logger: Logger = pino({
  level: process.env.PINO_LOG_LEVEL || 'info',
  redact: [], // prevent logging of sensitive data
});

export default logger;
