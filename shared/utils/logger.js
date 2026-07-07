/**
 * shared/utils/logger.js
 *
 * Winston logger factory.
 *
 * Design decisions:
 * - Each service passes its own `serviceName` so every log line is
 *   tagged, making multi-service log aggregation trivial.
 * - In production (NODE_ENV=production) logs are written as JSON to
 *   rotating files so an ELK/Loki stack can ingest them directly.
 * - In development logs are pretty-printed to stdout with colours.
 */

const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs = require('fs');

function createServiceLogger(serviceName) {
  // Resolve log directory relative to this file (shared/utils/logger.js)
  // so all services write to the same central <project_root>/logs/ folder,
  // regardless of each service's working directory.
  const logDir = process.env.LOG_DIR || path.join(__dirname, '..', '..', 'logs');

  // Ensure log directory exists (services call this at boot)
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const isProd = process.env.NODE_ENV === 'production';

  const baseFormat = format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format((info) => {
      info.service = serviceName;
      return info;
    })()
  );

  const transportList = [
    new transports.Console({
      format: isProd
        ? format.combine(baseFormat, format.json())
        : format.combine(
            baseFormat,
            format.colorize(),
            format.printf(({ timestamp, level, message, service, ...meta }) => {
              const metaStr = Object.keys(meta).length
                ? ' ' + JSON.stringify(meta)
                : '';
              return `[${timestamp}] [${service}] ${level}: ${message}${metaStr}`;
            })
          ),
    }),
  ];

  // Always write to log files (dev: plain text, prod: JSON)
  // This ensures the logs/ directory is always populated for inspection.
  transportList.push(
    new transports.File({
      filename: path.join(logDir, `${serviceName}-error.log`),
      level: 'error',
      format: format.combine(baseFormat, format.json()),
    }),
    new transports.File({
      filename: path.join(logDir, `${serviceName}-combined.log`),
      format: format.combine(baseFormat, format.json()),
    })
  );

  return createLogger({
    level: process.env.LOG_LEVEL || 'info',
    transports: transportList,
  });
}

module.exports = { createServiceLogger };
