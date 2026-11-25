const crypto = require('crypto');

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/**
 * Parses and validates an ISO-8601 timestamp string strictly in UTC.
 * Accepts trailing 'Z' or '+00:00' / '-00:00' offsets only.
 */
function parseStrictUtcTimestamp(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`${fieldName} must be a non-empty ISO-8601 UTC string.`);
  }

  const utcIsoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]00:00)$/;
  if (!utcIsoRegex.test(value)) {
    throw new ValidationError(
      `${fieldName} must be a valid ISO-8601 UTC timestamp (e.g., 2026-12-01T10:00:00Z).`
    );
  }

  const epochMs = Date.parse(value);
  if (Number.isNaN(epochMs)) {
    throw new ValidationError(`${fieldName} is not a valid calendar date/time.`);
  }

  // Guard against calendar rollovers like Feb 30 -> Mar 2
  const normalized = new Date(epochMs).toISOString();
  const inputDatePart = value.slice(0, 10);
  if (!normalized.startsWith(inputDatePart)) {
    throw new ValidationError(`${fieldName} contains an invalid calendar date.`);
  }

  return epochMs;
}

class AppointmentService {
  constructor() {
    // Primary store: appointmentId -> appointment record
    this.appointments = new Map();
    // Secondary index: providerId -> Set<appointmentId>
    this.providerAppointments = new Map();
    // Per-provider promise chain to serialize concurrent mutations
    this.providerLocks = new Map();
  }

  /**
   * Serializes async operations per providerId to prevent TOCTOU race conditions.
   */
  async _withProviderLock(providerId, task) {
    const previous = this.providerLocks.get(providerId) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => {
      release = resolve;
    });

    const chain = previous.then(() => current);
    this.providerLocks.set(providerId, chain);

    await previous;
    try {
      return await task();
    } finally {
      release();
      if (this.providerLocks.get(providerId) === chain) {
        this.providerLocks.delete(providerId);
      }
    }
  }

  /**
   * Books a new appointment for a provider if no active overlapping booking exists.
   *
   * @param {Object} params
   * @param {string} params.providerId
   * @param {string} params.clientId
   * @param {string} params.startTime - ISO-8601 UTC string
   * @param {string} params.endTime - ISO-8601 UTC string
   * @returns {Promise<Object>} Created appointment record
   */
  async bookAppointment({ providerId, clientId, startTime, endTime } = {}) {
    if (typeof providerId !== 'string' || providerId.trim() === '') {
      throw new ValidationError('providerId is required and must be a non-empty string.');
    }
    if (typeof clientId !== 'string' || clientId.trim() === '') {
      throw new ValidationError('clientId is required and must be a non-empty string.');
    }

    const startMs = parseStrictUtcTimestamp(startTime, 'startTime');
    const endMs = parseStrictUtcTimestamp(endTime, 'endTime');

    if (endMs <= startMs) {
      throw new ValidationError('Appointment duration must be positive (endTime must be after startTime).');
    }

    const normalizedProviderId = providerId.trim();
    const normalizedClientId = clientId.trim();

    return this._withProviderLock(normalizedProviderId, async () => {
      const existingIds = this.providerAppointments.get(normalizedProviderId) || new Set();

      for (const id of existingIds) {
        const existing = this.appointments.get(id);
        if (!existing || existing.status !== 'ACTIVE') {
          continue;
        }

        // Half-open interval overlap check: [startMs, endMs) vs [existing.startMs, existing.endMs)
        // Adjacent intervals (endMs === existing.startMs or startMs === existing.endMs) do NOT overlap.
        const overlaps = startMs < existing.endMs && existing.startMs < endMs;
        if (overlaps) {
          throw new ConflictError(
            `Provider ${normalizedProviderId} already has an active overlapping appointment (${existing.id}).`
          );
        }
      }

      const appointment = {
        id: crypto.randomUUID(),
        providerId: normalizedProviderId,
        clientId: normalizedClientId,
        startTime: new Date(startMs).toISOString(),
        endTime: new Date(endMs).toISOString(),
        startMs,
        endMs,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        cancelledAt: null,
      };

      this.appointments.set(appointment.id, appointment);
      existingIds.add(appointment.id);
      this.providerAppointments.set(normalizedProviderId, existingIds);

      return this._toPublicView(appointment);
    });
  }

  /**
   * Cancels an active appointment, freeing its time interval for future bookings.
   *
   * @param {string} appointmentId
   * @returns {Promise<Object>} Cancelled appointment record
   */
  async cancelAppointment(appointmentId) {
    if (typeof appointmentId !== 'string' || appointmentId.trim() === '') {
      throw new ValidationError('appointmentId is required and must be a non-empty string.');
    }

    const id = appointmentId.trim();
    const existing = this.appointments.get(id);
    if (!existing) {
      throw new NotFoundError(`Appointment ${id} does not exist.`);
    }

    return this._withProviderLock(existing.providerId, async () => {
      const record = this.appointments.get(id);
      if (record.status === 'CANCELLED') {
        throw new ConflictError(`Appointment ${id} is already cancelled.`);
      }

      record.status = 'CANCELLED';
      record.cancelledAt = new Date().toISOString();

      return this._toPublicView(record);
    });
  }

  getAppointment(appointmentId) {
    const record = this.appointments.get(appointmentId);
    return record ? this._toPublicView(record) : null;
  }

  _toPublicView(record) {
    return {
      id: record.id,
      providerId: record.providerId,
      clientId: record.clientId,
      startTime: record.startTime,
      endTime: record.endTime,
      status: record.status,
      createdAt: record.createdAt,
      cancelledAt: record.cancelledAt,
    };
  }
}

module.exports = {
  AppointmentService,
  ValidationError,
  ConflictError,
  NotFoundError,
};
