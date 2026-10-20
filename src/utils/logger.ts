import { pino, type Logger } from 'pino';
import { stripUrlUserinfo } from './url.ts';

// URL-shaped fields are sanitized (userinfo stripped) rather than blanked,
// so the URL stays useful in logs while credentials never reach them (F5).
const URL_FIELDS = new Set(['url', 'sourceURL'])

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
      'url',
      'sourceURL',
    ],
    // pino 10 allows a single redact config, so one censor handles both
    // families: the path tells us which treatment the field needs.
    censor: (value: unknown, path: string[]) =>
      URL_FIELDS.has(path[path.length - 1]) && typeof value === 'string'
        ? stripUrlUserinfo(value)
        : '[Redacted]',
  },
});

export default logger;
