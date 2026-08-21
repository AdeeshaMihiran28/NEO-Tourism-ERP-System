import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '../generated/prisma/client';

const departmentNames = [
  'Management',
  'Sales',
  'Administration / Operations',
  'Accounts',
  'HR',
  'IT',
  'Cybersecurity',
  'Marketing',
];

const roleNames = [
  'SUPER_ADMIN',
  'DIRECTOR',
  'MANAGER',
  'SALES',
  'OPERATIONS',
  'ACCOUNTS',
  'HR',
  'IT',
  'CYBERSECURITY',
  'MARKETING',
];

const permissionCodes = [
  'user.view',
  'user.create',
  'user.edit',
  'user.manage_roles',
  'department.view',
  'department.manage',
  'role.view',
  'role.manage',
  'customer.view',
  'customer.create',
  'customer.edit',
  'customer.note.create',
  'lead.view',
  'lead.view_all',
  'lead.create',
  'lead.edit',
  'lead.assign',
  'lead.change_status',
  'lead.note.create',
  'booking.view',
  'booking.create',
  'booking.edit',
  'finance.view',
  'finance.edit',
  'finance.reconcile',
  'audit.view',
];

async function seed() {
  const connectionString = process.env.DATABASE_URL;
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!connectionString || !adminEmail || !adminPassword) {
    throw new Error(
      'DATABASE_URL, SEED_ADMIN_EMAIL, and SEED_ADMIN_PASSWORD are required.',
    );
  }

  if (adminPassword.length < 8) {
    throw new Error('SEED_ADMIN_PASSWORD must contain at least 8 characters.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    for (const name of departmentNames) {
      await prisma.department.upsert({
        where: { name },
        update: { isActive: true },
        create: { name },
      });
    }

    for (const name of roleNames) {
      await prisma.role.upsert({
        where: { name },
        update: {},
        create: { name },
      });
    }

    for (const code of permissionCodes) {
      await prisma.permission.upsert({
        where: { code },
        update: {},
        create: { code },
      });
    }

    const managementDepartment = await prisma.department.findUniqueOrThrow({
      where: { name: 'Management' },
    });
    const superAdminRole = await prisma.role.findUniqueOrThrow({
      where: { name: 'SUPER_ADMIN' },
    });
    const permissions = await prisma.permission.findMany({
      select: { id: true },
    });

    await prisma.rolePermission.createMany({
      data: permissions.map(({ id: permissionId }) => ({
        roleId: superAdminRole.id,
        permissionId,
      })),
      skipDuplicates: true,
    });

    const passwordHash = await bcrypt.hash(adminPassword, 12);
    const admin = await prisma.user.upsert({
      where: { email: adminEmail },
      update: {
        passwordHash,
        firstName: 'Development',
        lastName: 'Administrator',
        departmentId: managementDepartment.id,
        isActive: true,
      },
      create: {
        email: adminEmail,
        passwordHash,
        firstName: 'Development',
        lastName: 'Administrator',
        departmentId: managementDepartment.id,
      },
    });

    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: admin.id,
          roleId: superAdminRole.id,
        },
      },
      update: {},
      create: {
        userId: admin.id,
        roleId: superAdminRole.id,
      },
    });

    console.log(
      `Seeded ${departmentNames.length} departments, ${roleNames.length} roles, and ${permissionCodes.length} permissions.`,
    );
    console.log(`Development administrator: ${adminEmail}`);
  } finally {
    await prisma.$disconnect();
  }
}

void seed();
