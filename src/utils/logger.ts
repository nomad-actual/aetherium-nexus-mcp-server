import { pino, type Logger } from 'pino';

const logger: Logger = pino({
  level: process.env.PINO_LOG_LEVEL || 'info',
  redact: {
    // pino has no default redaction; hide credential-like headers in case a
    // request-shaped object is ever logged.
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'headers.authorization',
      'headers.cookie',
    ],
    censor: '[Redacted]',
  },
});

export default logger;
