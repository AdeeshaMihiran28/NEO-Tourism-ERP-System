import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import {
  AccountsStatus,
  AccessRequestStatus,
  AttentionReason,
  BookingStatus,
  BookingSupplierStatus,
  BookingTaskStatus,
  CustomerType,
  DiscrepancyStatus,
  DiscrepancyType,
  EmployeeDocumentCategory,
  EmploymentStatus,
  EmploymentType,
  FolderStatus,
  FollowUpStatus,
  FollowUpType,
  ITAssetStatus,
  ITAssetType,
  ITTicketCategory,
  ITTicketPriority,
  ITTicketStatus,
  LeadStatus,
  OperationsStatus,
  PassengerPaymentStatus,
  PaymentMethod,
  Prisma,
  PrismaClient,
  ProcessStatus,
  ReconciliationStatus,
  SaleSubmissionStatus,
  SupplierPaymentStatus,
  SupplierType,
  TravelStatus,
} from '../generated/prisma/client';

const UAT_MARKER = '[UAT TEST DATA]';

function stableId(group: number, sequence: number) {
  const suffix = String(group * 1000 + sequence).padStart(12, '0');
  return `10000000-0000-4000-8000-${suffix}`;
}

function daysFromNow(days: number) {
  const value = new Date();
  value.setUTCHours(12, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() + days);
  return value;
}

function assertUatEnvironment(connectionString: string) {
  if (process.env.APP_ENV?.trim().toLowerCase() !== 'uat') {
    throw new Error('UAT seed refused: APP_ENV must be exactly "uat".');
  }

  const databaseName = new URL(connectionString).pathname
    .replace(/^\//, '')
    .toLowerCase();
  if (!databaseName.includes('_uat')) {
    throw new Error(
      `UAT seed refused: database name "${databaseName}" does not contain "_uat".`,
    );
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const password = process.env.UAT_USER_PASSWORD;
  const emailDomain =
    process.env.UAT_EMAIL_DOMAIN?.trim().toLowerCase() ||
    'uat.neo-tourism.invalid';

  if (!connectionString || !password) {
    throw new Error('DATABASE_URL and UAT_USER_PASSWORD are required.');
  }
  assertUatEnvironment(connectionString);
  if (password.length < 12) {
    throw new Error('UAT_USER_PASSWORD must contain at least 12 characters.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const selfServiceCodes = [
      'hr.leave.create',
      'hr.leave.view_own',
      'it.ticket.create',
      'it.ticket.view_own',
      'it.access_request.create',
    ];
    const selfServicePermissions = await prisma.permission.findMany({
      where: { code: { in: selfServiceCodes } },
    });
    if (selfServicePermissions.length !== selfServiceCodes.length) {
      throw new Error('Run the normal base seed before the UAT seed.');
    }

    const employeeRole = await prisma.role.upsert({
      where: { name: 'UAT_EMPLOYEE' },
      update: {},
      create: { name: 'UAT_EMPLOYEE' },
    });
    await prisma.rolePermission.deleteMany({
      where: { roleId: employeeRole.id },
    });
    await prisma.rolePermission.createMany({
      data: selfServicePermissions.map(({ id: permissionId }) => ({
        roleId: employeeRole.id,
        permissionId,
      })),
    });

    const accountDefinitions = [
      ['manager', 'Manager', 'Management', 'MANAGER'],
      ['sales1', 'Sales 1', 'Sales', 'SALES'],
      ['sales2', 'Sales 2', 'Sales', 'SALES'],
      [
        'operations1',
        'Operations 1',
        'Administration / Operations',
        'OPERATIONS',
      ],
      ['accounts1', 'Accounts 1', 'Accounts', 'ACCOUNTS'],
      ['hr1', 'HR 1', 'HR', 'HR'],
      ['it1', 'IT 1', 'IT', 'IT'],
      ['employee1', 'Employee 1', 'Marketing', 'UAT_EMPLOYEE'],
    ] as const;

    const users = new Map<string, { id: string; email: string }>();
    for (const [
      key,
      displayName,
      departmentName,
      roleName,
    ] of accountDefinitions) {
      const department = await prisma.department.findUniqueOrThrow({
        where: { name: departmentName },
      });
      const role = await prisma.role.findUniqueOrThrow({
        where: { name: roleName },
      });
      const email = `uat.${key}@${emailDomain}`;
      const user = await prisma.user.upsert({
        where: { email },
        update: {
          firstName: 'UAT',
          lastName: displayName,
          passwordHash,
          departmentId: department.id,
          isActive: true,
        },
        create: {
          id: stableId(1, users.size + 1),
          email,
          firstName: 'UAT',
          lastName: displayName,
          passwordHash,
          departmentId: department.id,
        },
      });
      await prisma.userRole.deleteMany({ where: { userId: user.id } });
      await prisma.userRole.create({
        data: { userId: user.id, roleId: role.id },
      });
      users.set(key, { id: user.id, email });
    }

    const roleIsolationRules = [
      ['sales1', ['admin.sale.accept', 'finance.view', 'hr.employee.create']],
      ['operations1', ['finance.view', 'finance.reconcile', 'hr.leave.manage']],
      ['hr1', ['it.asset.create', 'it.ticket.manage', 'finance.view']],
      ['employee1', ['dashboard.management.view', 'user.view', 'audit.view']],
    ] as const;
    for (const [key, forbiddenCodes] of roleIsolationRules) {
      const user = users.get(key)!;
      const forbidden = await prisma.rolePermission.findFirst({
        where: {
          role: { users: { some: { userId: user.id } } },
          permission: { code: { in: [...forbiddenCodes] } },
        },
        include: { permission: true },
      });
      if (forbidden) {
        throw new Error(
          `RBAC isolation failed for ${user.email}: ${forbidden.permission.code}.`,
        );
      }
    }

    const sales1 = users.get('sales1')!;
    const operations1 = users.get('operations1')!;
    const accounts1 = users.get('accounts1')!;
    const hr1 = users.get('hr1')!;
    const it1 = users.get('it1')!;
    const employee1 = users.get('employee1')!;

    const customerDefinitions = [
      {
        id: stableId(2, 1),
        firstName: 'John',
        lastName: 'Smith',
        email: `uat.john.smith@${emailDomain}`,
        customerType: CustomerType.NEW,
        destination: 'Dubai',
      },
      {
        id: stableId(2, 2),
        firstName: 'Sarah',
        lastName: 'Brown',
        email: `uat.sarah.brown@${emailDomain}`,
        customerType: CustomerType.REPEAT,
        destination: 'Maldives',
      },
      {
        id: stableId(2, 3),
        firstName: 'Michael',
        lastName: 'Lee',
        email: `uat.michael.lee@${emailDomain}`,
        customerType: CustomerType.REFERRAL,
        destination: 'Thailand',
      },
    ];
    for (const [index, customer] of customerDefinitions.entries()) {
      await prisma.customer.upsert({
        where: { id: customer.id },
        update: {
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phone: `+94770000${String(index + 1).padStart(3, '0')}`,
          customerType: customer.customerType,
          isActive: true,
          updatedById: sales1.id,
        },
        create: {
          id: customer.id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phone: `+94770000${String(index + 1).padStart(3, '0')}`,
          customerType: customer.customerType,
          createdById: sales1.id,
          updatedById: sales1.id,
        },
      });
      await prisma.customerNote.upsert({
        where: { id: stableId(3, index + 1) },
        update: { content: `${UAT_MARKER} Safe fictional customer record.` },
        create: {
          id: stableId(3, index + 1),
          customerId: customer.id,
          content: `${UAT_MARKER} Safe fictional customer record.`,
          createdById: sales1.id,
        },
      });
    }

    const leadDefinitions = [
      ['fresh', LeadStatus.NEW, null, false, null],
      ['handling', LeadStatus.HANDLING, sales1.id, false, null],
      ['quoting', LeadStatus.QUOTING, sales1.id, false, null],
      ['followup', LeadStatus.FOLLOW_UP, sales1.id, false, daysFromNow(2)],
      ['callback', LeadStatus.CALLBACK, sales1.id, false, daysFromNow(1)],
      ['attention', LeadStatus.HANDLING, sales1.id, true, null],
      ['going', LeadStatus.GOING_TO_BOOK, sales1.id, false, null],
    ] as const;
    for (const [
      index,
      [key, status, assignedUserId, attention, nextActionAt],
    ] of leadDefinitions.entries()) {
      const customer = customerDefinitions[index % customerDefinitions.length];
      const leadId = stableId(4, index + 1);
      await prisma.lead.upsert({
        where: { id: leadId },
        update: {
          customerId: customer.id,
          assignedUserId,
          assignedAt: assignedUserId ? daysFromNow(-5) : null,
          status,
          destination: customer.destination,
          summary: `${UAT_MARKER} ${key.replaceAll('_', ' ')} lead scenario.`,
          nextActionAt,
          lastMeaningfulActivityAt: attention
            ? daysFromNow(-5)
            : daysFromNow(-1),
          isAttentionRequired: attention,
          attentionReason: attention
            ? AttentionReason.NO_ACTIVITY_3_DAYS
            : null,
          attentionSince: attention ? daysFromNow(-1) : null,
        },
        create: {
          id: leadId,
          customerId: customer.id,
          assignedUserId,
          assignedAt: assignedUserId ? daysFromNow(-5) : null,
          status,
          source: 'UAT Seed',
          destination: customer.destination,
          travelDate: daysFromNow(45 + index),
          summary: `${UAT_MARKER} ${key.replaceAll('_', ' ')} lead scenario.`,
          nextActionAt,
          lastMeaningfulActivityAt: attention
            ? daysFromNow(-5)
            : daysFromNow(-1),
          isAttentionRequired: attention,
          attentionReason: attention
            ? AttentionReason.NO_ACTIVITY_3_DAYS
            : null,
          attentionSince: attention ? daysFromNow(-1) : null,
          createdById: sales1.id,
        },
      });
    }

    const followUpLeadIndexes = [4, 5];
    for (const [sequence, leadSequence] of followUpLeadIndexes.entries()) {
      await prisma.followUp.upsert({
        where: { id: stableId(5, sequence + 1) },
        update: {
          scheduledAt: daysFromNow(sequence + 1),
          note: `${UAT_MARKER} Future callback suppresses inactivity attention.`,
          status: FollowUpStatus.SCHEDULED,
        },
        create: {
          id: stableId(5, sequence + 1),
          leadId: stableId(4, leadSequence),
          assignedUserId: sales1.id,
          type: FollowUpType.CALLBACK,
          scheduledAt: daysFromNow(sequence + 1),
          note: `${UAT_MARKER} Future callback suppresses inactivity attention.`,
          status: FollowUpStatus.SCHEDULED,
          createdById: sales1.id,
        },
      });
    }

    const supplier = await prisma.supplier.upsert({
      where: { id: stableId(6, 1) },
      update: { name: 'UAT Demo Travel Supplier', isActive: true },
      create: {
        id: stableId(6, 1),
        name: 'UAT Demo Travel Supplier',
        supplierType: SupplierType.TOUR_OPERATOR,
        email: `uat.supplier@${emailDomain}`,
      },
    });

    const bookingScenarios = [
      [
        'New Booking',
        BookingStatus.NEW,
        TravelStatus.UPCOMING,
        OperationsStatus.PENDING,
        AccountsStatus.NOT_STARTED,
        FolderStatus.OPEN,
      ],
      [
        'Operations In Progress',
        BookingStatus.IN_PROGRESS,
        TravelStatus.UPCOMING,
        OperationsStatus.IN_PROGRESS,
        AccountsStatus.NOT_STARTED,
        FolderStatus.OPEN,
      ],
      [
        'Supplier Pending',
        BookingStatus.IN_PROGRESS,
        TravelStatus.UPCOMING,
        OperationsStatus.SUPPLIER_PENDING,
        AccountsStatus.NOT_STARTED,
        FolderStatus.OPEN,
      ],
      [
        'Travel Upcoming',
        BookingStatus.READY,
        TravelStatus.UPCOMING,
        OperationsStatus.READY,
        AccountsStatus.RECONCILIATION_PENDING,
        FolderStatus.OPEN,
      ],
      [
        'Travel Complete / Accounts Pending',
        BookingStatus.COMPLETED,
        TravelStatus.TRAVEL_COMPLETE,
        OperationsStatus.COMPLETE,
        AccountsStatus.RECONCILIATION_PENDING,
        FolderStatus.OPEN,
      ],
      [
        'Reconciliation Discrepancy',
        BookingStatus.COMPLETED,
        TravelStatus.TRAVEL_COMPLETE,
        OperationsStatus.COMPLETE,
        AccountsStatus.DISCREPANCY,
        FolderStatus.OPEN,
      ],
      [
        'Fully Reconciled',
        BookingStatus.COMPLETED,
        TravelStatus.UPCOMING,
        OperationsStatus.COMPLETE,
        AccountsStatus.RECONCILED,
        FolderStatus.OPEN,
      ],
      [
        'Closed Folder',
        BookingStatus.COMPLETED,
        TravelStatus.TRAVEL_COMPLETE,
        OperationsStatus.COMPLETE,
        AccountsStatus.RECONCILED,
        FolderStatus.CLOSED,
      ],
    ] as const;

    for (const [index, scenario] of bookingScenarios.entries()) {
      const [
        label,
        status,
        travelStatus,
        operationsStatus,
        accountsStatus,
        folderStatus,
      ] = scenario;
      const sequence = index + 1;
      const customer = customerDefinitions[index % customerDefinitions.length];
      const leadId = stableId(7, sequence);
      const saleId = stableId(8, sequence);
      const bookingId = stableId(9, sequence);
      const sellingPrice = new Prisma.Decimal(2500 + index * 200);
      const supplierCost = new Prisma.Decimal(1800 + index * 150);

      await prisma.lead.upsert({
        where: { id: leadId },
        update: { status: LeadStatus.SALE_MADE, assignedUserId: sales1.id },
        create: {
          id: leadId,
          customerId: customer.id,
          assignedUserId: sales1.id,
          assignedAt: daysFromNow(-20),
          status: LeadStatus.SALE_MADE,
          source: 'UAT Seed',
          destination: customer.destination,
          travelDate: daysFromNow(index < 5 ? 30 + index : -10),
          summary: `${UAT_MARKER} Booking scenario: ${label}.`,
          lastMeaningfulActivityAt: daysFromNow(-10),
          createdById: sales1.id,
        },
      });
      await prisma.saleSubmission.upsert({
        where: { id: saleId },
        update: { status: SaleSubmissionStatus.ADMIN_ACCEPTED },
        create: {
          id: saleId,
          leadId,
          customerId: customer.id,
          submittedByUserId: sales1.id,
          destination: customer.destination,
          travelStartDate: daysFromNow(index < 5 ? 30 + index : -10),
          travelEndDate: daysFromNow(index < 5 ? 37 + index : -3),
          sellingPrice,
          depositAmount: new Prisma.Decimal(500),
          currency: 'GBP',
          paymentMethod: PaymentMethod.BANK_TRANSFER,
          paymentReference: `UAT-DEPOSIT-${sequence}`,
          salesNotes: `${UAT_MARKER} ${label}.`,
          status: SaleSubmissionStatus.ADMIN_ACCEPTED,
          submittedAt: daysFromNow(-18),
        },
      });
      await prisma.booking.upsert({
        where: { id: bookingId },
        update: {
          status,
          travelStatus,
          operationsStatus,
          accountsStatus,
          folderStatus,
          operationsOwnerId: operations1.id,
          supplierCost,
        },
        create: {
          id: bookingId,
          folderNumber: `UAT-2026-${String(sequence).padStart(4, '0')}`,
          customerId: customer.id,
          leadId,
          saleSubmissionId: saleId,
          salesAdvisorId: sales1.id,
          operationsOwnerId: operations1.id,
          status,
          travelStatus,
          operationsStatus,
          accountsStatus,
          folderStatus,
          destination: customer.destination,
          travelStartDate: daysFromNow(index < 5 ? 30 + index : -10),
          travelEndDate: daysFromNow(index < 5 ? 37 + index : -3),
          finalServiceDate: daysFromNow(index < 5 ? 37 + index : -3),
          sellingPrice,
          supplierCost,
          currency: 'GBP',
          createdById: operations1.id,
        },
      });
      await prisma.passenger.upsert({
        where: { id: stableId(10, sequence) },
        update: { firstName: customer.firstName, lastName: customer.lastName },
        create: {
          id: stableId(10, sequence),
          bookingId,
          firstName: customer.firstName,
          lastName: customer.lastName,
          nationality: 'UAT Test Nationality',
          passportNumber: `UAT-PASSPORT-${sequence}`,
          email: customer.email,
          isPrimaryPassenger: true,
        },
      });
      const bookingSupplier = await prisma.bookingSupplier.upsert({
        where: { id: stableId(11, sequence) },
        update: {
          supplierCost,
          status:
            operationsStatus === OperationsStatus.SUPPLIER_PENDING
              ? BookingSupplierStatus.PENDING
              : BookingSupplierStatus.CONFIRMED,
        },
        create: {
          id: stableId(11, sequence),
          bookingId,
          supplierId: supplier.id,
          supplierReference: `UAT-SUP-${sequence}`,
          serviceType: 'UAT package service',
          supplierCost,
          currency: 'GBP',
          status:
            operationsStatus === OperationsStatus.SUPPLIER_PENDING
              ? BookingSupplierStatus.PENDING
              : BookingSupplierStatus.CONFIRMED,
          notes: UAT_MARKER,
        },
      });
      await prisma.bookingReference.upsert({
        where: { id: stableId(12, sequence) },
        update: { reference: `UATPNR${sequence}` },
        create: {
          id: stableId(12, sequence),
          bookingId,
          type: 'PNR',
          reference: `UATPNR${sequence}`,
          supplierId: supplier.id,
        },
      });
      await prisma.bookingNote.upsert({
        where: { id: stableId(13, sequence) },
        update: { content: `${UAT_MARKER} ${label}.` },
        create: {
          id: stableId(13, sequence),
          bookingId,
          content: `${UAT_MARKER} ${label}.`,
          createdById: operations1.id,
        },
      });
      await prisma.bookingTask.upsert({
        where: { id: stableId(14, sequence) },
        update: { title: `Verify ${label}`, status: BookingTaskStatus.OPEN },
        create: {
          id: stableId(14, sequence),
          bookingId,
          title: `Verify ${label}`,
          description: UAT_MARKER,
          assignedUserId: operations1.id,
          dueAt: daysFromNow(2),
          status: BookingTaskStatus.OPEN,
          createdById: operations1.id,
        },
      });
      await prisma.bookingFinance.upsert({
        where: { bookingId },
        update: {
          sellingPrice,
          supplierCost,
          expectedRevenue: sellingPrice,
          expectedProfit: sellingPrice.minus(supplierCost),
        },
        create: {
          bookingId,
          sellingPrice,
          supplierCost,
          expectedRevenue: sellingPrice,
          expectedProfit: sellingPrice.minus(supplierCost),
          currency: 'GBP',
        },
      });

      if (index >= 4) {
        const isReconciled = accountsStatus === AccountsStatus.RECONCILED;
        const hasDiscrepancy = accountsStatus === AccountsStatus.DISCREPANCY;
        const reconciliation = await prisma.reconciliation.upsert({
          where: { bookingId },
          update: {
            status: hasDiscrepancy
              ? ReconciliationStatus.DISCREPANCY
              : isReconciled
                ? ReconciliationStatus.RECONCILED
                : ReconciliationStatus.IN_REVIEW,
            passengerPaymentsVerified: isReconciled,
            supplierCostsVerified: isReconciled,
            supplierPaymentsVerified: isReconciled,
            sellingPriceVerified: isReconciled,
            feesVerified: isReconciled,
            adjustmentsVerified: isReconciled,
            profitVerified: isReconciled,
            reconciledById: isReconciled ? accounts1.id : null,
            reconciledAt: isReconciled ? daysFromNow(-1) : null,
          },
          create: {
            bookingId,
            status: hasDiscrepancy
              ? ReconciliationStatus.DISCREPANCY
              : isReconciled
                ? ReconciliationStatus.RECONCILED
                : ReconciliationStatus.IN_REVIEW,
            passengerPaymentsVerified: isReconciled,
            supplierCostsVerified: isReconciled,
            supplierPaymentsVerified: isReconciled,
            sellingPriceVerified: isReconciled,
            feesVerified: isReconciled,
            adjustmentsVerified: isReconciled,
            profitVerified: isReconciled,
            reconciledById: isReconciled ? accounts1.id : null,
            reconciledAt: isReconciled ? daysFromNow(-1) : null,
            notes: UAT_MARKER,
          },
        });
        await prisma.passengerPayment.upsert({
          where: { id: stableId(15, sequence) },
          update: {
            amount: sellingPrice,
            status: isReconciled
              ? PassengerPaymentStatus.VERIFIED
              : PassengerPaymentStatus.RECEIVED,
          },
          create: {
            id: stableId(15, sequence),
            bookingId,
            amount: sellingPrice,
            currency: 'GBP',
            paymentMethod: PaymentMethod.BANK_TRANSFER,
            paymentReference: `UAT-PAX-PAY-${sequence}`,
            paymentDate: daysFromNow(-12),
            status: isReconciled
              ? PassengerPaymentStatus.VERIFIED
              : PassengerPaymentStatus.RECEIVED,
            recordedById: accounts1.id,
            verifiedById: isReconciled ? accounts1.id : null,
            verifiedAt: isReconciled ? daysFromNow(-2) : null,
            notes: UAT_MARKER,
          },
        });
        await prisma.supplierPayment.upsert({
          where: { id: stableId(16, sequence) },
          update: {
            amount: supplierCost,
            status: isReconciled
              ? SupplierPaymentStatus.VERIFIED
              : SupplierPaymentStatus.PAID,
          },
          create: {
            id: stableId(16, sequence),
            bookingId,
            bookingSupplierId: bookingSupplier.id,
            amount: supplierCost,
            currency: 'GBP',
            paymentReference: `UAT-SUP-PAY-${sequence}`,
            paymentDate: daysFromNow(-11),
            status: isReconciled
              ? SupplierPaymentStatus.VERIFIED
              : SupplierPaymentStatus.PAID,
            recordedById: accounts1.id,
            verifiedById: isReconciled ? accounts1.id : null,
            verifiedAt: isReconciled ? daysFromNow(-2) : null,
            notes: UAT_MARKER,
          },
        });
        if (hasDiscrepancy) {
          await prisma.reconciliationDiscrepancy.upsert({
            where: { id: stableId(17, sequence) },
            update: {
              status: DiscrepancyStatus.OPEN,
              assignedUserId: accounts1.id,
            },
            create: {
              id: stableId(17, sequence),
              reconciliationId: reconciliation.id,
              bookingId,
              type: DiscrepancyType.SUPPLIER_COST_MISMATCH,
              description: `${UAT_MARKER} Resolve this fictional supplier-cost difference.`,
              amountDifference: new Prisma.Decimal(25),
              currency: 'GBP',
              status: DiscrepancyStatus.OPEN,
              assignedUserId: accounts1.id,
              createdById: accounts1.id,
            },
          });
        }
      }
    }

    await prisma.customer.update({
      where: { id: customerDefinitions[1].id },
      data: { customerType: CustomerType.REPEAT },
    });

    const marketingDepartment = await prisma.department.findUniqueOrThrow({
      where: { name: 'Marketing' },
    });
    const employee = await prisma.employee.upsert({
      where: { employeeNumber: 'UAT-EMP-0001' },
      update: {
        userId: employee1.id,
        firstName: 'UAT',
        lastName: 'Employee 1',
        employmentStatus: EmploymentStatus.ACTIVE,
      },
      create: {
        id: stableId(18, 1),
        userId: employee1.id,
        employeeNumber: 'UAT-EMP-0001',
        firstName: 'UAT',
        lastName: 'Employee 1',
        personalEmail: `uat.employee.personal@${emailDomain}`,
        workEmail: employee1.email,
        jobTitle: 'UAT Test Employee',
        departmentId: marketingDepartment.id,
        employmentType: EmploymentType.FULL_TIME,
        employmentStatus: EmploymentStatus.ACTIVE,
        joinDate: daysFromNow(-90),
        onboardingStatus: ProcessStatus.IN_PROGRESS,
      },
    });
    await prisma.leaveRequest.upsert({
      where: { id: stableId(19, 1) },
      update: {
        status: 'PENDING',
        reason: `${UAT_MARKER} Annual leave request.`,
      },
      create: {
        id: stableId(19, 1),
        employeeId: employee.id,
        leaveType: 'ANNUAL',
        startDate: daysFromNow(20),
        endDate: daysFromNow(22),
        reason: `${UAT_MARKER} Annual leave request.`,
      },
    });
    await prisma.employeeDocument.upsert({
      where: { id: stableId(20, 1) },
      update: { fileName: 'UAT-placeholder-contract.txt' },
      create: {
        id: stableId(20, 1),
        employeeId: employee.id,
        fileName: 'UAT-placeholder-contract.txt',
        fileType: 'text/plain',
        storageKey: 'uat-placeholder://employee-contract',
        category: EmployeeDocumentCategory.CONTRACT,
        uploadedById: hr1.id,
      },
    });

    const asset = await prisma.iTAsset.upsert({
      where: { assetTag: 'UAT-ASSET-0001' },
      update: { status: ITAssetStatus.AVAILABLE },
      create: {
        id: stableId(21, 1),
        assetTag: 'UAT-ASSET-0001',
        assetType: ITAssetType.LAPTOP,
        manufacturer: 'UAT Manufacturer',
        model: 'UAT Laptop Model',
        serialNumber: 'UAT-SERIAL-0001',
        status: ITAssetStatus.AVAILABLE,
        notes: UAT_MARKER,
      },
    });
    await prisma.assetAssignment.updateMany({
      where: { assetId: asset.id, returnedAt: null },
      data: { returnedAt: new Date(), returnedToId: it1.id },
    });
    await prisma.iTTicket.upsert({
      where: { ticketNumber: 'UAT-IT-0001' },
      update: { status: ITTicketStatus.OPEN, assignedToUserId: null },
      create: {
        id: stableId(22, 1),
        ticketNumber: 'UAT-IT-0001',
        requestedByEmployeeId: employee.id,
        category: ITTicketCategory.SOFTWARE,
        priority: ITTicketPriority.MEDIUM,
        status: ITTicketStatus.OPEN,
        subject: 'UAT test software request',
        description: `${UAT_MARKER} Safe fictional IT ticket.`,
      },
    });
    await prisma.accessRequest.upsert({
      where: { id: stableId(23, 1) },
      update: { status: AccessRequestStatus.PENDING },
      create: {
        id: stableId(23, 1),
        employeeId: employee.id,
        requestedById: employee1.id,
        systemName: 'UAT Demo System',
        accessType: 'Standard test access',
        reason: `${UAT_MARKER} Test the approval workflow.`,
        status: AccessRequestStatus.PENDING,
      },
    });

    console.log('UAT seed completed safely.');
    console.log(`Created/updated ${accountDefinitions.length} role accounts.`);
    console.log(`Login email domain: ${emailDomain}`);
    console.log('No password was printed.');
  } finally {
    await prisma.$disconnect();
  }
}

void main();
