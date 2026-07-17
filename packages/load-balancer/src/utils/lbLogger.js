/**
 * load-balancer/src/utils/lbLogger.js  (Phase 11)
 *
 * Winston logger factory for the Load Balancer.
 * Mirrors the pattern used by shared/utils/logger.js but kept internal
 * to the load-balancer package so it remains fully independent of the
 * monorepo's shared directory (it's a separate deployable process).
 *
 * In a Docker / multi-process deployment the Load Balancer runs as its
 * own container / process separate from the Gateway — so it cannot require
 * relative paths into the shared/ tree.
 */

'use strict';

const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs   = require('fs');

/**
 * createLBLogger – returns a Winston logger tagged with the given service name.
 * @param {string} serviceName
 * @returns {import('winston').Logger}
 */
function createLBLogger(serviceName) {
  const logDir  = process.env.LOG_DIR || '/app/logs';
  const isProd  = process.env.NODE_ENV === 'production';

  // Ensure log directory exists
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
