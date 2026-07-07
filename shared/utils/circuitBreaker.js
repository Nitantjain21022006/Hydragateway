/**
 * shared/utils/circuitBreaker.js
 *
 * Generic 3-state Circuit Breaker FSM.
 *
 * States:
 *  CLOSED     – Normal operation. Requests pass through.
 *  OPEN       – Service is unhealthy. Requests are rejected immediately
 *               without hitting the downstream service.
 *  HALF_OPEN  – Probe state. Allows a limited number of requests through.
 *               If successThreshold consecutive requests succeed, transitions back to CLOSED.
 *               If any request fails, trips back to OPEN.
 */

const { AppError } = require('./errorResponse');
const { createServiceLogger } = require('./logger');

const logger = createServiceLogger('circuit-breaker');

const STATE = Object.freeze({
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
});

class CircuitBreaker {
  /**
   * @param {object} opts
   * @param {string} opts.name                    Identifier for logging
   * @param {number} [opts.threshold]             Consecutive failures to open (default 5)
   * @param {number} [opts.timeout]               Ms to wait before HALF_OPEN probe (default 10000)
   * @param {number} [opts.successThreshold]      Consecutive successes to close (default 2)
   * @param {number} [opts.requestTimeout]        Ms to wait for request to resolve before timing out (default 3000)
   * @param {number} [opts.retryAttempts]         Max retry attempts for transient errors (default 3)
   * @param {number} [opts.retryDelay]            Ms to delay between retries (default 1000)
   * @param {Function} [opts.onStateChange]       Optional callback(name, newState, prevState)
   */
  constructor({
    name,
    threshold = parseInt(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD || '5', 10),
    timeout = parseInt(process.env.CIRCUIT_BREAKER_COOLDOWN_MS || '10000', 10),
    successThreshold = parseInt(process.env.CIRCUIT_BREAKER_SUCCESS_THRESHOLD || '2', 10),
    requestTimeout = parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT_MS || '3000', 10),
    retryAttempts = parseInt(process.env.CIRCUIT_BREAKER_RETRY_ATTEMPTS || '3', 10),
    retryDelay = parseInt(process.env.CIRCUIT_BREAKER_RETRY_DELAY_MS || '1000', 10),
    onStateChange = null,
  } = {}) {
    this.name = name || 'default';
    this.threshold = threshold;
    this.timeout = timeout;
    this.successThreshold = successThreshold;
    this.requestTimeout = requestTimeout;
    this.retryAttempts = retryAttempts;
    this.retryDelay = retryDelay;
    this.onStateChange = onStateChange;

    this._state = STATE.CLOSED;
    this._failureCount = 0;
    this._successCount = 0;
    this._lastFailureTime = null;
    this._nextAttemptTime = null;
  }

  get state() {
    return this._state;
  }

  /**
   * Execute the protected function through the breaker.
   * @param {Function} fn  Async function to execute
   * @returns {Promise<any>} Result of fn()
   */
  async fire(fn) {
    if (this._state === STATE.OPEN) {
      if (Date.now() < this._nextAttemptTime) {
        throw new AppError(
          `Circuit breaker OPEN for service [${this.name}]`,
          503,
          'CIRCUIT_OPEN'
        );
      }
      // Transition to HALF_OPEN to probe
      this._transition(STATE.HALF_OPEN);
    }

    let lastError;
    const attempts = this.retryAttempts;
    const delay = this.retryDelay;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new AppError(`Request to service [${this.name}] timed out`, 504, 'UPSTREAM_TIMEOUT'));
        }, this.requestTimeout);
      });

      try {
        // Race the actual function against the request timeout
        const result = await Promise.race([fn(), timeoutPromise]);
        clearTimeout(timeoutId);
        this._onSuccess();
        return result;
      } catch (err) {
        clearTimeout(timeoutId);
        lastError = err;

        const isTransient = this._isTransientError(err);
        const hasMoreAttempts = attempt < attempts;

        // Only retry transient errors
        if (isTransient && hasMoreAttempts) {
          logger.warn(
            `[CircuitBreaker] Service [${this.name}] failed (attempt ${attempt}/${attempts}). Retrying in ${delay}ms... Error: ${err.message}`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          break;
        }
      }
    }

    this._onFailure(lastError);
    throw lastError;
  }

  _onSuccess() {
    if (this._state === STATE.HALF_OPEN) {
      this._successCount += 1;
      logger.info(
        `[CircuitBreaker] Service [${this.name}] probe success ${this._successCount}/${this.successThreshold}`
      );
      if (this._successCount >= this.successThreshold) {
        this._failureCount = 0;
        this._successCount = 0;
        this._transition(STATE.CLOSED);
      }
    } else if (this._state === STATE.CLOSED) {
      this._failureCount = 0;
    }
  }

  _onFailure(err) {
    // Client errors (4xx) do NOT count as failures
    if (err && err.response && err.response.status >= 400 && err.response.status < 500) {
      return;
    }

    // Do not count circuit open itself as a failure (though it shouldn't happen inside fire unless fn throws it)
    if (err && err.code === 'CIRCUIT_OPEN') {
      return;
    }

    this._failureCount += 1;
    this._lastFailureTime = Date.now();
    logger.error(
      `[CircuitBreaker] Service [${this.name}] recorded failure #${this._failureCount}. Error: ${err ? err.message : 'Unknown'}`
    );

    if (this._state === STATE.HALF_OPEN) {
      // In HALF_OPEN, any failure trips back to OPEN immediately
      this._trip();
      return;
    }

    if (this._failureCount >= this.threshold) {
      this._trip();
    }
  }

  _trip() {
    this._nextAttemptTime = Date.now() + this.timeout;
    this._transition(STATE.OPEN);
  }

  _transition(newState) {
    const prev = this._state;
    if (prev === newState) return;

    this._state = newState;
    logger.warn(
      `[CircuitBreaker] Service [${this.name}] transitioned from ${prev} to ${newState}`
    );

    if (this.onStateChange) {
      try {
        this.onStateChange(this.name, newState, prev);
      } catch (err) {
        logger.error(`[CircuitBreaker] Error in onStateChange callback: ${err.message}`);
      }
    }
  }

  _isTransientError(err) {
    // If it's our own upstream timeout AppError
    if (err && err.code === 'UPSTREAM_TIMEOUT') {
      return true;
    }
    // Axios network-level errors or connection timeouts
    if (err && !err.response) {
      return true;
    }
    // Status codes representing temporarily unavailable or gateway timeouts
    if (err && err.response && (err.response.status === 503 || err.response.status === 504)) {
      return true;
    }
    return false;
  }

  toJSON() {
    return {
      name: this.name,
      state: this._state,
      failureCount: this._failureCount,
      successCount: this._successCount,
      lastFailureTime: this._lastFailureTime,
      nextAttemptTime: this._nextAttemptTime,
    };
  }
}

module.exports = { CircuitBreaker, STATE };

