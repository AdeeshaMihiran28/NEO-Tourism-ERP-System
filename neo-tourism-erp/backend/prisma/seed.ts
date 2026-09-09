import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '../generated/prisma/client';

const departmentNames = [
  'Management',
  'Sales',
  'Administration / Operations',
  'Accounts',
  'Finance',
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
  'MARKETING_MANAGER',
  'EMPLOYEE',
  'FINANCE',
  'FINANCE_APPROVER',
  'IT_ADMIN',
  'SYSTEM_ADMIN',
  'MANAGEMENT',
  'OWNER',
];

const permissionCodes = [
  'user.view',
  'user.create',
  'user.edit',
  'user.manage_roles',
  'user.manage_privileged_roles',
  'organization.owner.manage',
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
  'followup.view',
  'followup.create',
  'followup.edit',
  'followup.complete',
  'lead.attention.view',
  'lead.attention.manage',
  'lead.reassign',
  'sale.create',
  'sale.view_own',
  'sale.edit_own',
  'sale.submit',
  'admin.sale_queue.view',
  'admin.sale.accept',
  'booking.view',
  'booking.create',
  'booking.edit',
  'booking.view_all',
  'booking.assign_operations',
  'booking.manage_passengers',
  'booking.manage_suppliers',
  'booking.manage_references',
  'booking.manage_documents',
  'booking.manage_notes',
  'booking.manage_tasks',
  'booking.status.manage',
  'booking.lifecycle.view',
  'booking.lifecycle.manage',
  'booking.operations.complete',
  'booking.closed.edit',
  'booking.reopen',
  'finance.view',
  'finance.edit',
  'finance.payment.create',
  'finance.payment.verify',
  'finance.adjustment.create',
  'finance.adjustment.approve',
  'finance.reconcile',
  'finance.discrepancy.manage',
  'bank.account.view',
  'bank.account.manage',
  'bank.transaction.view',
  'bank.transaction.manage',
  'bank.reconciliation.view',
  'bank.reconciliation.perform',
  'bank.reconciliation.finalize',
  'gl.account.view',
  'gl.account.manage',
  'journal.view',
  'journal.create',
  'journal.approve',
  'journal.post',
  'journal.reverse',
  'general-ledger.view',
  'trial-balance.view',
  'accounting.settings.view',
  'accounting.settings.manage',
  'accounting.period.view',
  'accounting.period.manage',
  'accounting.period.close',
  'accounting.period.reopen',
  'fx.rate.view',
  'fx.rate.manage',
  'tax.code.view',
  'tax.code.manage',
  'report.pnl.view',
  'report.balance-sheet.view',
  'report.cash-flow.view',
  'report.tax.view',
  'report.audit.view',
  'audit.view',
  'hr.employee.view',
  'hr.employee.create',
  'hr.employee.edit',
  'hr.employee.status.manage',
  'hr.attendance.view',
  'hr.attendance.manage',
  'hr.shift.view',
  'hr.shift.manage',
  'hr.leave.create',
  'hr.leave.view_own',
  'hr.leave.manage',
  'hr.document.view',
  'hr.document.manage',
  'hr.org_chart.view',
  'hr.directory.view',
  'hr.employment_history.view',
  'hr.employee.import',
  'hr.employee.export',
  'hr.custom_field.manage',
  'hr.leave.balance.view',
  'hr.leave.balance.manage',
  'hr.leave.calendar.view',
  'hr.leave.manager_approve',
  'hr.leave.hr_approve',
  'hr.attendance.report.view',
  'hr.onboarding.view',
  'hr.onboarding.manage',
  'hr.offboarding.view',
  'hr.offboarding.manage',
  'hr.document.view_own',
  'hr.document.view_all',
  'hr.team.view',
  'hr.report.view',
  'hr.access_review.view',
  'hr.access_review.manage',
  'it.asset.view',
  'it.asset.create',
  'it.asset.edit',
  'it.asset.assign',
  'it.ticket.create',
  'it.ticket.view_own',
  'it.ticket.view_all',
  'it.ticket.manage',
  'it.access_request.create',
  'it.access_request.view',
  'it.access_request.approve',
  'it.access_request.fulfil',
  'integration.view',
  'integration.manage',
  'dashboard.management.view',
  'dashboard.sales.view',
  'dashboard.operations.view',
  'dashboard.accounts.view',
  'dashboard.hr.view',
  'dashboard.it.view',
  'marketing.deal.view',
  'marketing.deal.create',
  'marketing.deal.edit',
  'marketing.deal.submit',
  'marketing.deal.approve',
  'marketing.deal.schedule',
  'marketing.deal.publish',
  'marketing.deal.suspend',
  'marketing.deal.channel.manage',
  'marketing.deal.sales_view',
  'marketing.content.view',
  'marketing.content.create',
  'marketing.content.edit',
  'marketing.content.assign',
  'marketing.content.version.create',
  'marketing.content.submit_review',
  'marketing.approval.view',
  'marketing.approval.approve',
  'marketing.approval.request_changes',
  'marketing.approval.reject',
  'marketing.content.publish',
  'marketing.content.comment',
  'marketing.calendar.view',
  'marketing.calendar.create',
  'marketing.calendar.edit',
  'marketing.calendar.reschedule',
  'marketing.alert.view',
  'integration.meta.view',
  'integration.meta.manage',
  'integration.meta.sync',
  'marketing.pulse.view',
  'marketing.sales_signal.create',
  'marketing.sales_signal.view',
  'marketing.sales_signal.manage',
  'marketing.workload.view',
  'marketing.signal.view',
  'marketing.signal.management',
  'marketing.attribution.view',
  'marketing.attribution.manage',
  'marketing.attribution.override',
  'marketing.radar.view',
  'marketing.opportunity.view',
  'marketing.opportunity.create',
  'marketing.opportunity.manage',
  'marketing.neotrio.view',
  'marketing.neotrio.idea.view',
  'marketing.neotrio.idea.create',
  'marketing.neotrio.idea.edit',
  'marketing.neotrio.idea.manage',
  'marketing.neotrio.production.view',
  'marketing.neotrio.production.create',
  'marketing.neotrio.production.edit',
  'marketing.neotrio.production.assign',
  'marketing.neotrio.character.view',
  'marketing.neotrio.character.manage',
  'marketing.neotrio.asset.upload',
  'marketing.neotrio.asset.approve',
  'marketing.neotrio.library.view',
  'marketing.neotrio.performance.view',
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

    const leavePolicies = [
      {
        name: 'Standard Annual Leave',
        leaveType: 'ANNUAL' as const,
        annualEntitlement: 14,
        accrualMethod: 'ANNUAL' as const,
        accrualAmount: 0,
        allowCarryForward: true,
        maxCarryForward: 5,
        allowNegativeBalance: false,
      },
      {
        name: 'Standard Sick Leave',
        leaveType: 'SICK' as const,
        annualEntitlement: 7,
        accrualMethod: 'ANNUAL' as const,
        accrualAmount: 0,
        allowCarryForward: false,
        maxCarryForward: 0,
        allowNegativeBalance: false,
      },
      {
        name: 'Standard Casual Leave',
        leaveType: 'CASUAL' as const,
        annualEntitlement: 7,
        accrualMethod: 'ANNUAL' as const,
        accrualAmount: 0,
        allowCarryForward: false,
        maxCarryForward: 0,
        allowNegativeBalance: false,
      },
    ];
    for (const policy of leavePolicies) {
      await prisma.leavePolicy.upsert({
        where: {
          name_leaveType: { name: policy.name, leaveType: policy.leaveType },
        },
        create: policy,
        update: { ...policy, isActive: true },
      });
      await prisma.leaveApprovalPolicy.upsert({
        where: { leaveType: policy.leaveType },
        create: {
          leaveType: policy.leaveType,
          requiresManagerApproval: true,
          requiresHrApproval: true,
        },
        update: {},
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

    const defaultRolePermissions: Record<string, string[]> = {
      DIRECTOR: [
        'user.view',
        'customer.view',
        'lead.view',
        'lead.view_all',
        'booking.view',
        'booking.view_all',
        'booking.lifecycle.view',
        'finance.view',
        ...permissionCodes.filter((code) => code.startsWith('report.')),
        'audit.view',
        'hr.employee.view',
        'hr.attendance.view',
        'hr.leave.manage',
        'hr.org_chart.view',
        'hr.directory.view',
        'hr.employment_history.view',
        'hr.leave.balance.view',
        'hr.leave.calendar.view',
        'hr.attendance.report.view',
        'hr.team.view',
        'hr.report.view',
        'hr.access_review.view',
        'it.asset.view',
        'it.ticket.view_all',
        'dashboard.management.view',
        'dashboard.sales.view',
        'dashboard.operations.view',
        'dashboard.accounts.view',
        'dashboard.hr.view',
        'dashboard.it.view',
        'integration.view',
        'marketing.deal.view',
        'marketing.deal.approve',
        'marketing.content.view',
        'marketing.approval.view',
        'marketing.approval.approve',
        'marketing.signal.view',
        'marketing.signal.management',
        'marketing.radar.view',
        'marketing.opportunity.view',
        'marketing.neotrio.view',
        'marketing.neotrio.character.view',
        'marketing.neotrio.library.view',
        'marketing.neotrio.performance.view',
      ],
      MANAGER: [
        'user.view',
        'customer.view',
        'lead.view',
        'lead.view_all',
        'lead.assign',
        'lead.attention.view',
        'lead.attention.manage',
        'lead.reassign',
        'booking.view',
        'booking.view_all',
        'booking.lifecycle.view',
        'hr.employee.view',
        'hr.attendance.view',
        'hr.leave.manage',
        'hr.org_chart.view',
        'hr.directory.view',
        'hr.leave.calendar.view',
        'hr.leave.manager_approve',
        'hr.attendance.report.view',
        'hr.team.view',
        'it.asset.view',
        'it.ticket.view_all',
        'dashboard.management.view',
        'dashboard.sales.view',
        'dashboard.operations.view',
        'dashboard.accounts.view',
        'dashboard.hr.view',
        'dashboard.it.view',
        'integration.view',
      ],
      SALES: [
        'customer.view',
        'customer.create',
        'customer.edit',
        'customer.note.create',
        'lead.view',
        'lead.assign',
        'lead.create',
        'lead.edit',
        'lead.change_status',
        'lead.note.create',
        'followup.view',
        'followup.create',
        'followup.edit',
        'followup.complete',
        'lead.attention.view',
        'sale.create',
        'sale.view_own',
        'sale.edit_own',
        'sale.submit',
        'booking.view',
        'booking.lifecycle.view',
        'dashboard.sales.view',
        'marketing.deal.sales_view',
        'marketing.sales_signal.create',
      ],
      OPERATIONS: [
        'admin.sale_queue.view',
        'admin.sale.accept',
        'booking.view',
        'booking.view_all',
        'booking.create',
        'booking.edit',
        'booking.assign_operations',
        'booking.manage_passengers',
        'booking.manage_suppliers',
        'booking.manage_references',
        'booking.manage_documents',
        'booking.manage_notes',
        'booking.manage_tasks',
        'booking.status.manage',
        'booking.lifecycle.view',
        'booking.operations.complete',
        'finance.edit',
        'dashboard.operations.view',
      ],
      ACCOUNTS: [
        'booking.view',
        'booking.view_all',
        'booking.lifecycle.view',
        'finance.view',
        'finance.edit',
        'finance.payment.create',
        'finance.payment.verify',
        'finance.adjustment.create',
        'finance.adjustment.approve',
        'finance.reconcile',
        'finance.discrepancy.manage',
        ...permissionCodes.filter((code) => code.startsWith('bank.')),
        ...permissionCodes.filter((code) => code.startsWith('gl.')),
        ...permissionCodes.filter((code) => code.startsWith('journal.')),
        ...permissionCodes.filter((code) => code.startsWith('accounting.')),
        ...permissionCodes.filter((code) => code.startsWith('fx.')),
        ...permissionCodes.filter((code) => code.startsWith('tax.')),
        ...permissionCodes.filter((code) => code.startsWith('report.')),
        'general-ledger.view',
        'trial-balance.view',
        'dashboard.accounts.view',
      ],
      HR: [
        ...permissionCodes.filter((code) => code.startsWith('hr.')),
        'dashboard.hr.view',
      ],
      IT: [
        ...permissionCodes.filter((code) => code.startsWith('it.')),
        'audit.view',
        'dashboard.it.view',
        'integration.view',
        'integration.manage',
        'integration.meta.view',
        'marketing.neotrio.view',
        'marketing.neotrio.idea.view',
        'marketing.neotrio.idea.create',
        'marketing.neotrio.idea.edit',
        'marketing.neotrio.production.view',
        'marketing.neotrio.production.create',
        'marketing.neotrio.production.edit',
        'marketing.neotrio.character.view',
        'marketing.neotrio.asset.upload',
        'marketing.neotrio.library.view',
        'marketing.neotrio.performance.view',
        'integration.meta.manage',
        'integration.meta.sync',
      ],
      CYBERSECURITY: [
        'user.view',
        'role.view',
        'audit.view',
        'it.asset.view',
        'it.ticket.view_all',
        'it.access_request.view',
        'integration.view',
        'dashboard.it.view',
      ],
      MARKETING: [
        'marketing.deal.view',
        'marketing.deal.create',
        'marketing.deal.edit',
        'marketing.deal.submit',
        'marketing.deal.channel.manage',
        'marketing.content.view',
        'marketing.content.create',
        'marketing.content.edit',
        'marketing.content.version.create',
        'marketing.content.submit_review',
        'marketing.content.comment',
        'marketing.calendar.view',
        'marketing.calendar.create',
        'marketing.calendar.reschedule',
        'marketing.alert.view',
        'marketing.pulse.view',
        'marketing.sales_signal.view',
        'marketing.workload.view',
        'marketing.signal.view',
        'marketing.attribution.view',
        'marketing.radar.view',
        'marketing.opportunity.view',
        'marketing.opportunity.create',
        'integration.meta.view',
      ],
      MARKETING_MANAGER: permissionCodes.filter(
        (code) =>
          code.startsWith('marketing.') || code.startsWith('integration.meta.'),
      ),
      EMPLOYEE: [],
      FINANCE: [
        'booking.view',
        'booking.view_all',
        'booking.lifecycle.view',
        'finance.view',
        'finance.edit',
        'finance.payment.create',
        'finance.adjustment.create',
        'finance.reconcile',
        'finance.discrepancy.manage',
        'bank.account.view',
        'bank.transaction.view',
        'bank.transaction.manage',
        'bank.reconciliation.view',
        'bank.reconciliation.perform',
        'gl.account.view',
        'journal.view',
        'journal.create',
        'general-ledger.view',
        'trial-balance.view',
        ...permissionCodes.filter((code) => code.startsWith('report.')),
        'dashboard.accounts.view',
      ],
      FINANCE_APPROVER: [
        'finance.payment.verify',
        'finance.adjustment.approve',
        'bank.reconciliation.finalize',
        'journal.approve',
        'journal.post',
        'journal.reverse',
        'accounting.period.close',
        'accounting.period.reopen',
      ],
      IT_ADMIN: [
        'user.view',
        'user.create',
        'user.edit',
        'user.manage_roles',
        'role.view',
        'department.view',
        ...permissionCodes.filter((code) => code.startsWith('it.')),
        'audit.view',
        'dashboard.it.view',
        'integration.view',
      ],
      SYSTEM_ADMIN: [
        'user.view',
        'user.create',
        'user.edit',
        'user.manage_roles',
        'user.manage_privileged_roles',
        'role.view',
        'department.view',
        'hr.access_review.view',
        'hr.access_review.manage',
        ...permissionCodes.filter((code) => code.startsWith('it.')),
        'audit.view',
        'dashboard.it.view',
        'integration.view',
        'integration.manage',
      ],
      MANAGEMENT: [
        'customer.view',
        'lead.view',
        'lead.view_all',
        'booking.view',
        'booking.view_all',
        'booking.lifecycle.view',
        'finance.view',
        ...permissionCodes.filter((code) => code.startsWith('report.')),
        'dashboard.management.view',
        'dashboard.sales.view',
        'dashboard.operations.view',
        'dashboard.accounts.view',
        'dashboard.hr.view',
        'dashboard.it.view',
      ],
      OWNER: ['audit.view'],
    };
    const employeeSelfServicePermissions = [
      'hr.leave.create',
      'hr.leave.view_own',
      'hr.org_chart.view',
      'hr.directory.view',
      'hr.document.view_own',
      'it.ticket.create',
      'it.ticket.view_own',
      'it.access_request.create',
    ];
    for (const roleName of [
      'DIRECTOR',
      'MANAGER',
      'SALES',
      'OPERATIONS',
      'ACCOUNTS',
      'HR',
      'IT',
      'CYBERSECURITY',
      'MARKETING',
      'MARKETING_MANAGER',
      'EMPLOYEE',
    ]) {
      defaultRolePermissions[roleName] = [
        ...(defaultRolePermissions[roleName] ?? []),
        ...employeeSelfServicePermissions,
      ];
    }
    for (const [roleName, codes] of Object.entries(defaultRolePermissions)) {
      const role = await prisma.role.findUniqueOrThrow({
        where: { name: roleName },
      });
      const rolePermissions = await prisma.permission.findMany({
        where: { code: { in: codes } },
        select: { id: true },
      });
      await prisma.rolePermission.createMany({
        data: rolePermissions.map(({ id: permissionId }) => ({
          roleId: role.id,
          permissionId,
        })),
        skipDuplicates: true,
      });
    }
    const managerRole = await prisma.role.findUniqueOrThrow({
      where: { name: 'MANAGER' },
    });
    const broadLeavePermission = await prisma.permission.findUniqueOrThrow({
      where: { code: 'hr.leave.manage' },
    });
    await prisma.rolePermission.deleteMany({
      where: {
        roleId: managerRole.id,
        permissionId: broadLeavePermission.id,
      },
    });
    const hrRole = await prisma.role.findUniqueOrThrow({
      where: { name: 'HR' },
    });
    const accessRolePermission = await prisma.permission.findUniqueOrThrow({
      where: { code: 'hr.access_review.manage' },
    });
    await prisma.rolePermission.deleteMany({
      where: {
        roleId: hrRole.id,
        permissionId: accessRolePermission.id,
      },
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

    for (const character of [
      { code: 'RICKY', name: 'Ricky' },
      { code: 'FLIP', name: 'Flip' },
      { code: 'OLI', name: 'Oli' },
    ]) {
      await prisma.neoTrioCharacter.upsert({
        where: { code: character.code },
        update: { name: character.name, isActive: true, updatedById: admin.id },
        create: {
          ...character,
          createdById: admin.id,
          updatedById: admin.id,
        },
      });
    }

    const testPassword = process.env.SEED_TEST_USER_PASSWORD;
    if (testPassword) {
      if (testPassword.length < 8) {
        throw new Error(
          'SEED_TEST_USER_PASSWORD must contain at least 8 characters.',
        );
      }
      const testPasswordHash = await bcrypt.hash(testPassword, 12);
      const testAccounts = [
        ['sales.test@local.test', 'Sales', 'SALES'],
        [
          'operations.test@local.test',
          'Administration / Operations',
          'OPERATIONS',
        ],
        ['accounts.test@local.test', 'Accounts', 'ACCOUNTS'],
        ['hr.test@local.test', 'HR', 'HR'],
        ['it.test@local.test', 'IT', 'IT'],
        ['manager.test@local.test', 'Management', 'MANAGER'],
      ] as const;
      for (const [email, departmentName, roleName] of testAccounts) {
        const department = await prisma.department.findUniqueOrThrow({
          where: { name: departmentName },
        });
        const role = await prisma.role.findUniqueOrThrow({
          where: { name: roleName },
        });
        const firstName = roleName.charAt(0) + roleName.slice(1).toLowerCase();
        const user = await prisma.user.upsert({
          where: { email },
          update: {
            passwordHash: testPasswordHash,
            departmentId: department.id,
            isActive: true,
          },
          create: {
            email,
            passwordHash: testPasswordHash,
            firstName,
            lastName: 'Tester',
            departmentId: department.id,
          },
        });
        await prisma.userRole.upsert({
          where: { userId_roleId: { userId: user.id, roleId: role.id } },
          update: {},
          create: { userId: user.id, roleId: role.id },
        });
      }
      console.log(`Seeded ${testAccounts.length} optional test accounts.`);
    }

    console.log(
      `Seeded ${departmentNames.length} departments, ${roleNames.length} roles, and ${permissionCodes.length} permissions.`,
    );
    console.log(`Development administrator: ${adminEmail}`);
  } finally {
    await prisma.$disconnect();
  }
}

void seed();
