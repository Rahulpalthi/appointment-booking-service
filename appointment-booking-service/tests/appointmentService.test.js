const {
  AppointmentService,
  ValidationError,
  ConflictError,
  NotFoundError,
} = require('../src/appointmentService');

describe('AppointmentService', () => {
  let service;

  beforeEach(() => {
    service = new AppointmentService();
  });

  describe('1. Valid booking', () => {
    test('books a valid appointment with positive duration in UTC', async () => {
      const booking = await service.bookAppointment({
        providerId: 'prov-1',
        clientId: 'client-1',
        startTime: '2026-12-01T10:00:00Z',
        endTime: '2026-12-01T10:30:00Z',
      });

      expect(booking.id).toBeDefined();
      expect(booking.providerId).toBe('prov-1');
      expect(booking.clientId).toBe('client-1');
      expect(booking.startTime).toBe('2026-12-01T10:00:00.000Z');
      expect(booking.endTime).toBe('2026-12-01T10:30:00.000Z');
      expect(booking.status).toBe('ACTIVE');
      expect(booking.cancelledAt).toBeNull();
    });
  });

  describe('2. Same-provider overlap vs. different providers', () => {
    beforeEach(async () => {
      await service.bookAppointment({
        providerId: 'prov-1',
        clientId: 'client-1',
        startTime: '2026-12-01T10:00:00Z',
        endTime: '2026-12-01T11:00:00Z',
      });
    });

    test.each([
      ['exact match', '2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z'],
      ['partial overlap at start', '2026-12-01T09:30:00Z', '2026-12-01T10:30:00Z'],
      ['partial overlap at end', '2026-12-01T10:30:00Z', '2026-12-01T11:30:00Z'],
      ['contained inside existing', '2026-12-01T10:15:00Z', '2026-12-01T10:45:00Z'],
      ['enclosing existing', '2026-12-01T09:00:00Z', '2026-12-01T12:00:00Z'],
    ])('rejects overlapping booking (%s) for the same provider', async (_, startTime, endTime) => {
      await expect(
        service.bookAppointment({
          providerId: 'prov-1',
          clientId: 'client-2',
          startTime,
          endTime,
        })
      ).rejects.toThrow(ConflictError);
    });

    test('allows overlapping time slot for a different provider', async () => {
      const otherProviderBooking = await service.bookAppointment({
        providerId: 'prov-2',
        clientId: 'client-2',
        startTime: '2026-12-01T10:00:00Z',
        endTime: '2026-12-01T11:00:00Z',
      });

      expect(otherProviderBooking.providerId).toBe('prov-2');
      expect(otherProviderBooking.status).toBe('ACTIVE');
    });
  });

  describe('3. Adjacent appointments', () => {
    test('allows booking immediately before and immediately after an existing appointment', async () => {
      await service.bookAppointment({
        providerId: 'prov-1',
        clientId: 'client-2',
        startTime: '2026-12-01T10:00:00Z',
        endTime: '2026-12-01T11:00:00Z',
      });

      const before = await service.bookAppointment({
        providerId: 'prov-1',
        clientId: 'client-1',
        startTime: '2026-12-01T09:00:00Z',
        endTime: '2026-12-01T10:00:00Z',
      });

      const after = await service.bookAppointment({
        providerId: 'prov-1',
        clientId: 'client-3',
        startTime: '2026-12-01T11:00:00Z',
        endTime: '2026-12-01T12:00:00Z',
      });

      expect(before.status).toBe('ACTIVE');
      expect(after.status).toBe('ACTIVE');
    });
  });

  describe('4. Cancellation behavior', () => {
    test('cancelling an active appointment frees the slot for a new booking', async () => {
      const first = await service.bookAppointment({
        providerId: 'prov-1',
        clientId: 'client-1',
        startTime: '2026-12-01T14:00:00Z',
        endTime: '2026-12-01T15:00:00Z',
      });

      const cancelled = await service.cancelAppointment(first.id);
      expect(cancelled.status).toBe('CANCELLED');
      expect(cancelled.cancelledAt).not.toBeNull();

      const rebooked = await service.bookAppointment({
        providerId: 'prov-1',
        clientId: 'client-2',
        startTime: '2026-12-01T14:00:00Z',
        endTime: '2026-12-01T15:00:00Z',
      });

      expect(rebooked.id).not.toBe(first.id);
      expect(rebooked.status).toBe('ACTIVE');
    });

    test('rejects cancelling a non-existent appointment ID', async () => {
      await expect(service.cancelAppointment('non-existent-id')).rejects.toThrow(NotFoundError);
    });

    test('rejects cancelling an already-cancelled appointment', async () => {
      const booking = await service.bookAppointment({
        providerId: 'prov-1',
        clientId: 'client-1',
        startTime: '2026-12-01T14:00:00Z',
        endTime: '2026-12-01T15:00:00Z',
      });

      await service.cancelAppointment(booking.id);
      await expect(service.cancelAppointment(booking.id)).rejects.toThrow(ConflictError);
    });
  });

  describe('5. Input validation without state mutation', () => {
    test.each([
      ['missing providerId', { clientId: 'c1', startTime: '2026-12-01T10:00:00Z', endTime: '2026-12-01T11:00:00Z' }],
      ['empty clientId', { providerId: 'p1', clientId: '   ', startTime: '2026-12-01T10:00:00Z', endTime: '2026-12-01T11:00:00Z' }],
      ['non-UTC offset timestamp', { providerId: 'p1', clientId: 'c1', startTime: '2026-12-01T10:00:00+05:30', endTime: '2026-12-01T11:00:00+05:30' }],
      ['missing timezone designator', { providerId: 'p1', clientId: 'c1', startTime: '2026-12-01T10:00:00', endTime: '2026-12-01T11:00:00' }],
      ['invalid calendar date (Feb 30)', { providerId: 'p1', clientId: 'c1', startTime: '2026-02-30T10:00:00Z', endTime: '2026-02-30T11:00:00Z' }],
      ['zero duration (start === end)', { providerId: 'p1', clientId: 'c1', startTime: '2026-12-01T10:00:00Z', endTime: '2026-12-01T10:00:00Z' }],
      ['negative duration (end < start)', { providerId: 'p1', clientId: 'c1', startTime: '2026-12-01T11:00:00Z', endTime: '2026-12-01T10:00:00Z' }],
    ])('rejects %s and leaves store unchanged', async (_, payload) => {
      await expect(service.bookAppointment(payload)).rejects.toThrow(ValidationError);
      expect(service.appointments.size).toBe(0);
    });
  });

  describe('6. Concurrency safety', () => {
    test('allows only one booking when multiple concurrent overlapping requests arrive for the same provider', async () => {
      const requests = Array.from({ length: 10 }, (_, idx) =>
        service.bookAppointment({
          providerId: 'prov-concurrent',
          clientId: `client-${idx}`,
          startTime: '2026-12-01T16:00:00Z',
          endTime: '2026-12-01T17:00:00Z',
        })
      );

      const results = await Promise.allSettled(requests);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(9);
      rejected.forEach((r) => expect(r.reason).toBeInstanceOf(ConflictError));
    });
  });
});
