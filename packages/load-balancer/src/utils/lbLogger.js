/**
 * Internal logger factory for the Load Balancer package using Winston.
 * Provides console and file logging setup for load balancer logs.
 * Exports createLBLogger.
 */

'use strict';

const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs   = require('fs');

function createLBLogger(serviceName) {
  const logDir  = process.env.LOG_DIR || '/app/logs';
  const isProd  = process.env.NODE_ENV === 'production';

  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const baseFormat = format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format((info) => { info.service = serviceName; return info; })()
  );

  const transportList = [
    new transports.Console({
      format: isProd
        ? format.combine(baseFormat, format.json())
        : format.combine(
            baseFormat,
            format.colorize(),
            format.printf(({ timestamp, level, message, service, ...meta }) => {
              const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
              return `[${timestamp}] [${service}] ${level}: ${message}${metaStr}`;
            })
          ),
    }),
  ];

  if (isProd) {
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
  }

  return createLogger({ level: process.env.LOG_LEVEL || 'info', transports: transportList });
}

module.exports = { createLBLogger };
