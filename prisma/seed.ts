import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;
const DEMO_PASSWORD = 'password123';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@fixitnow.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'Admin123!';

async function wipeDatabase() {
  await prisma.review.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.availability.deleteMany();
  await prisma.service.deleteMany();
  await prisma.technicianProfile.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  console.log('Wiping existing data...');
  await wipeDatabase();

  const hashedAdminPassword = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);
  const hashedDemoPassword = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS);

  console.log('Creating admin...');
  await prisma.user.create({
    data: {
      name: 'FixItNow Admin',
      email: ADMIN_EMAIL,
      password: hashedAdminPassword,
      role: 'ADMIN',
    },
  });

  console.log('Creating categories...');
  const [plumbing, electrical, cleaning] = await Promise.all(
    [
      { name: 'Plumbing', description: 'Leaks, pipes, fixtures, and installations' },
      { name: 'Electrical', description: 'Wiring, outlets, lighting, and inspections' },
      { name: 'Cleaning', description: 'Home and office cleaning services' },
    ].map((data) => prisma.category.create({ data }))
  );

  console.log('Creating technicians...');
  const bobUser = await prisma.user.create({
    data: {
      name: 'Bob the Plumber',
      email: 'bob.tech@fixitnow.com',
      password: hashedDemoPassword,
      phone: '+8801700000001',
      role: 'TECHNICIAN',
      technicianProfile: {
        create: { bio: '10 years fixing pipes across Dhaka.', experienceYears: 10, location: 'Dhaka' },
      },
    },
    include: { technicianProfile: true },
  });
  const erinUser = await prisma.user.create({
    data: {
      name: 'Erin the Electrician',
      email: 'erin.tech@fixitnow.com',
      password: hashedDemoPassword,
      phone: '+8801700000002',
      role: 'TECHNICIAN',
      technicianProfile: {
        create: { bio: 'Licensed electrician, residential & commercial.', experienceYears: 7, location: 'Dhaka' },
      },
    },
    include: { technicianProfile: true },
  });
  const frankUser = await prisma.user.create({
    data: {
      name: 'Frank the Cleaner',
      email: 'frank.tech@fixitnow.com',
      password: hashedDemoPassword,
      phone: '+8801700000003',
      role: 'TECHNICIAN',
      technicianProfile: {
        create: { bio: 'Deep-cleaning specialist for homes and offices.', experienceYears: 5, location: 'Chattogram' },
      },
    },
    include: { technicianProfile: true },
  });

  const bob = bobUser.technicianProfile!;
  const erin = erinUser.technicianProfile!;
  const frank = frankUser.technicianProfile!;

  console.log('Creating customers...');
  const carol = await prisma.user.create({
    data: { name: 'Carol Customer', email: 'carol@fixitnow.com', password: hashedDemoPassword, role: 'CUSTOMER' },
  });
  const dave = await prisma.user.create({
    data: { name: 'Dave Customer', email: 'dave@fixitnow.com', password: hashedDemoPassword, role: 'CUSTOMER' },
  });
  const emma = await prisma.user.create({
    data: { name: 'Emma Customer', email: 'emma@fixitnow.com', password: hashedDemoPassword, role: 'CUSTOMER' },
  });

  console.log('Creating services...');
  const leakRepair = await prisma.service.create({
    data: { title: 'Leak Repair', description: 'Fix leaking pipes and joints', price: 49.99, categoryId: plumbing.id, technicianId: bob.id },
  });
  const pipeInstall = await prisma.service.create({
    data: { title: 'Pipe Installation', description: 'New pipe installation for kitchens/bathrooms', price: 120, categoryId: plumbing.id, technicianId: bob.id },
  });
  const wiringInspection = await prisma.service.create({
    data: { title: 'Wiring Inspection', description: 'Full home wiring safety inspection', price: 60, categoryId: electrical.id, technicianId: erin.id },
  });
  const outletInstall = await prisma.service.create({
    data: { title: 'Outlet Installation', description: 'Install or replace power outlets', price: 35, categoryId: electrical.id, technicianId: erin.id },
  });
  const deepClean = await prisma.service.create({
    data: { title: 'Deep House Cleaning', description: 'Full deep clean for homes', price: 80, categoryId: cleaning.id, technicianId: frank.id },
  });
  const officeClean = await prisma.service.create({
    data: { title: 'Office Cleaning', description: 'Recurring office cleaning', price: 150, categoryId: cleaning.id, technicianId: frank.id },
  });
  console.log('Creating availability slots...');
  const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await prisma.availability.createMany({
    data: [
      { technicianId: bob.id, date: inDays(1), startTime: '09:00', endTime: '12:00' },
      { technicianId: bob.id, date: inDays(2), startTime: '13:00', endTime: '17:00' },
      { technicianId: erin.id, date: inDays(1), startTime: '10:00', endTime: '14:00' },
      { technicianId: frank.id, date: inDays(3), startTime: '08:00', endTime: '11:00' },
    ],
  });

  console.log('Creating bookings across the full status range...');

  // 1. COMPLETED + PAID(STRIPE) + reviewed
  const completedBooking = await prisma.booking.create({
    data: {
      customerId: carol.id,
      technicianId: bob.id,
      serviceId: leakRepair.id,
      scheduledDate: inDays(-5),
      address: '12 Gulshan Ave, Dhaka',
      notes: 'Kitchen sink leaking under the cabinet.',
      status: 'COMPLETED',
      price: leakRepair.price,
    },
  });
  await prisma.payment.create({
    data: {
      bookingId: completedBooking.id,
      transactionId: 'SEED-TXN-001',
      amount: leakRepair.price,
      provider: 'STRIPE',
      status: 'COMPLETED',
      paidAt: inDays(-6),
      metadata: { seed: true },
    },
  });
  await prisma.review.create({
    data: {
      bookingId: completedBooking.id,
      customerId: carol.id,
      technicianId: bob.id,
      rating: 5,
      comment: 'Great work, fixed the leak fast and cleaned up after!',
    },
  });
  await prisma.technicianProfile.update({ where: { id: bob.id }, data: { avgRating: 5, totalReviews: 1 } });

  // 2. IN_PROGRESS + PAID(SSLCOMMERZ)
  const inProgressBooking = await prisma.booking.create({
    data: {
      customerId: dave.id,
      technicianId: erin.id,
      serviceId: wiringInspection.id,
      scheduledDate: inDays(0),
      address: '45 Banani Rd, Dhaka',
      status: 'IN_PROGRESS',
      price: wiringInspection.price,
    },
  });
  await prisma.payment.create({
    data: {
      bookingId: inProgressBooking.id,
      transactionId: 'SEED-TXN-002',
      amount: wiringInspection.price,
      provider: 'SSLCOMMERZ',
      status: 'COMPLETED',
      paidAt: inDays(-1),
      metadata: { seed: true },
    },
  });

  // 3. PAID, not yet started
  const paidBooking = await prisma.booking.create({
    data: {
      customerId: emma.id,
      technicianId: frank.id,
      serviceId: deepClean.id,
      scheduledDate: inDays(2),
      address: '9 Agrabad, Chattogram',
      status: 'PAID',
      price: deepClean.price,
    },
  });
  await prisma.payment.create({
    data: {
      bookingId: paidBooking.id,
      transactionId: 'SEED-TXN-003',
      amount: deepClean.price,
      provider: 'STRIPE',
      status: 'COMPLETED',
      paidAt: inDays(-1),
      metadata: { seed: true },
    },
  });

  // 4. ACCEPTED, awaiting payment
  await prisma.booking.create({
    data: {
      customerId: carol.id,
      technicianId: erin.id,
      serviceId: outletInstall.id,
      scheduledDate: inDays(4),
      address: '12 Gulshan Ave, Dhaka',
      status: 'ACCEPTED',
      price: outletInstall.price,
    },
  });

  // 5. REQUESTED, awaiting technician response
  await prisma.booking.create({
    data: {
      customerId: dave.id,
      technicianId: bob.id,
      serviceId: pipeInstall.id,
      scheduledDate: inDays(6),
      address: '45 Banani Rd, Dhaka',
      status: 'REQUESTED',
      price: pipeInstall.price,
    },
  });

  // 6. DECLINED
  await prisma.booking.create({
    data: {
      customerId: emma.id,
      technicianId: frank.id,
      serviceId: officeClean.id,
      scheduledDate: inDays(-2),
      address: '9 Agrabad, Chattogram',
      status: 'DECLINED',
      price: officeClean.price,
    },
  });

  // 7. CANCELLED
  await prisma.booking.create({
    data: {
      customerId: carol.id,
      technicianId: bob.id,
      serviceId: leakRepair.id,
      scheduledDate: inDays(-3),
      address: '12 Gulshan Ave, Dhaka',
      status: 'CANCELLED',
      price: leakRepair.price,
    },
  });

  console.log('\nSeed complete.');
  console.log('----------------------------------------');
  console.log(`Admin login:      ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`Technician login: bob.tech@fixitnow.com / ${DEMO_PASSWORD}`);
  console.log(`Technician login: erin.tech@fixitnow.com / ${DEMO_PASSWORD}`);
  console.log(`Technician login: frank.tech@fixitnow.com / ${DEMO_PASSWORD}`);
  console.log(`Customer login:   carol@fixitnow.com / ${DEMO_PASSWORD}`);
  console.log(`Customer login:   dave@fixitnow.com / ${DEMO_PASSWORD}`);
  console.log(`Customer login:   emma@fixitnow.com / ${DEMO_PASSWORD}`);
  console.log('----------------------------------------');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
