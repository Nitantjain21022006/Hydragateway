/**
 * shared/utils/circuitBreaker.js
 *
 * Generic 3-state Circuit Breaker FSM.
 *
 * States:
 *  CLOSED   – Normal operation. Requests pass through.
 *  OPEN     – Service is unhealthy. Requests are rejected immediately
 *             without hitting the downstream service.
 *  HALF_OPEN – Probe state. A single request is allowed through to
 *             test if the service has recovered.
 *
 * Design decisions:
 * - Pure in-process state (no Redis) so latency for the check itself
 *   is nanoseconds.
 * - One CircuitBreaker instance per downstream service, created at
 *   Gateway startup and reused for every request.
 * - Failure threshold and timeout are configurable so each service
 *   can have its own sensitivity.
 *
 * Usage:
 *   const cb = new CircuitBreaker({ name: 'payment', threshold: 5, timeout: 30000 });
 *   try {
 *     const result = await cb.fire(() => callPaymentService(data));
 *   } catch (err) {
 *     // err.code === 'CIRCUIT_OPEN' if breaker rejected the call
 *   }
 */

const { AppError } = require('./errorResponse');

const STATE = Object.freeze({
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
});

class CircuitBreaker {
  /**
   * @param {object} opts
   * @param {string} opts.name          Identifier for logging
   * @param {number} [opts.threshold=5] Consecutive failures to open
   * @param {number} [opts.timeout=30000] Ms to wait before HALF_OPEN probe
   * @param {Function} [opts.onStateChange] Optional callback(name, newState)
   */
  constructor({ name, threshold = 5, timeout = 30000, onStateChange = null }) {
    this.name = name;
    this.threshold = threshold;
    this.timeout = timeout;
    this.onStateChange = onStateChange;

    this._state = STATE.CLOSED;
    this._failureCount = 0;
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
      // Transition to HALF_OPEN for a single probe request
      this._transition(STATE.HALF_OPEN);
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure();
      throw err;
    }
  }

  _onSuccess() {
    this._failureCount = 0;
    if (this._state !== STATE.CLOSED) {
      this._transition(STATE.CLOSED);
    }
  }

  _onFailure() {
    this._failureCount += 1;
    this._lastFailureTime = Date.now();

    if (this._state === STATE.HALF_OPEN) {
      // Probe failed – go back to OPEN
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
    this._state = newState;
    if (this.onStateChange && prev !== newState) {
      this.onStateChange(this.name, newState, prev);
    }
  }

  toJSON() {
    return {
      name: this.name,
      state: this._state,
      failureCount: this._failureCount,
      lastFailureTime: this._lastFailureTime,
      nextAttemptTime: this._nextAttemptTime,
    };
  }
}

module.exports = { CircuitBreaker, STATE };
