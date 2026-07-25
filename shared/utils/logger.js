/**
 * Factory utility for creating service-specific Winston logger instances.
 * Configures console logging and file transports for error and combined logs.
 * Exports createServiceLogger.
 */

const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs = require('fs');

function createServiceLogger(serviceName) {
  const logDir = process.env.LOG_DIR
    ? (path.isAbsolute(process.env.LOG_DIR) ? process.env.LOG_DIR : path.resolve(__dirname, '..', '..', process.env.LOG_DIR))
    : path.resolve(__dirname, '..', '..', 'logs');

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

  if (serviceName.startsWith('gateway') && serviceName !== 'gateway') {
    transportList.push(
      new transports.File({
        filename: path.join(logDir, 'gateway-combined.log'),
        format: format.combine(baseFormat, format.json()),
      })
    );
  }

  return createLogger({
    level: process.env.LOG_LEVEL || 'info',
    transports: transportList,
  });
}

module.exports = { createServiceLogger };
