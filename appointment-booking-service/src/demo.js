const { AppointmentService } = require('./appointmentService');

async function runDemo() {
  const service = new AppointmentService();

  console.log('1. Booking valid appointment (10:00 - 11:00 UTC)...');
  const appt1 = await service.bookAppointment({
    providerId: 'prov-101',
    clientId: 'client-201',
    startTime: '2026-12-01T10:00:00Z',
    endTime: '2026-12-01T11:00:00Z',
  });
  console.log('   Booked:', appt1.id, appt1.status);

  console.log('\n2. Attempting overlapping booking for same provider (10:30 - 11:30 UTC)...');
  try {
    await service.bookAppointment({
      providerId: 'prov-101',
      clientId: 'client-202',
      startTime: '2026-12-01T10:30:00Z',
      endTime: '2026-12-01T11:30:00Z',
    });
  } catch (err) {
    console.log(`   Correctly rejected (${err.name}): ${err.message}`);
  }

  console.log('\n3. Booking adjacent slot (11:00 - 12:00 UTC)...');
  const adjacent = await service.bookAppointment({
    providerId: 'prov-101',
    clientId: 'client-203',
    startTime: '2026-12-01T11:00:00Z',
    endTime: '2026-12-01T12:00:00Z',
  });
  console.log('   Adjacent booked:', adjacent.id, adjacent.status);

  console.log('\n4. Cancelling first appointment and rebooking its slot...');
  await service.cancelAppointment(appt1.id);
  const rebooked = await service.bookAppointment({
    providerId: 'prov-101',
    clientId: 'client-204',
    startTime: '2026-12-01T10:00:00Z',
    endTime: '2026-12-01T11:00:00Z',
  });
  console.log('   Rebooked after cancellation:', rebooked.id, rebooked.status);

  console.log('\n5. Rejecting non-UTC timestamp (+05:30)...');
  try {
    await service.bookAppointment({
      providerId: 'prov-101',
      clientId: 'client-205',
      startTime: '2026-12-01T14:00:00+05:30',
      endTime: '2026-12-01T15:00:00+05:30',
    });
  } catch (err) {
    console.log(`   Correctly rejected (${err.name}): ${err.message}`);
  }
  console.log('\n6. Booking same time slot (10:00 - 11:00 UTC) for a different provider (prov-102)...');
  const otherProviderBooking = await service.bookAppointment({
    providerId: 'prov-102',
    clientId: 'client-206',
    startTime: '2026-12-01T10:00:00Z',
    endTime: '2026-12-01T11:00:00Z',
  });
  console.log('   Other provider booked:', otherProviderBooking.providerId, otherProviderBooking.id, otherProviderBooking.status);
}

runDemo();
