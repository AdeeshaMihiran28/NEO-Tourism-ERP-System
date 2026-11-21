import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import {
  AccountsStatus,
  BookingStatus,
  BookingReferenceType,
  BookingChecklistItemType,
  BookingChecklistState,
  BookingProductIssueType,
  BookingSupplierStatus,
  BookingSpecialRequestStatus,
  BookingSpecialRequestType,
  FolderStatus,
  OperationsStatus,
  SaleProductCategory,
  SaleSubmissionStatus,
  TravelStatus,
} from '../../generated/prisma/enums';
import type { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { HrLaunchService } from '../hr/hr-launch.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import { BookingsService } from './bookings.service';
import { BookingLifecycleMilestone } from './dto/booking.dto';
import type { BookingLifecycleService } from './services/booking-lifecycle.service';

const admin: AuthenticatedUser = {
  id: 'admin-1',
  email: 'admin@example.test',
  firstName: 'Admin',
  lastName: 'User',
  isActive: true,
  department: 'Operations',
  roles: ['OPERATIONS'],
  permissions: [
    'booking.view',
    'booking.view_all',
    'booking.create',
    'booking.assign_operations',
    'booking.manage_passengers',
  ],
};

const sale = {
  id: 'sale-1',
  leadId: 'lead-1',
  customerId: 'customer-1',
  submittedByUserId: 'advisor-1',
  destination: 'London',
  travelStartDate: new Date('2027-01-10T00:00:00.000Z'),
  travelEndDate: new Date('2027-01-20T00:00:00.000Z'),
  sellingPrice: new Prisma.Decimal('1000.00'),
  currency: 'GBP',
  status: SaleSubmissionStatus.ADMIN_ACCEPTED,
  booking: null,
  products: [
    {
      id: 'product-1',
      supplierId: 'supplier-1',
      category: SaleProductCategory.INTERNATIONAL_FLIGHT,
      description: 'Colombo to London',
      estimatedSupplierCost: new Prisma.Decimal('700.00'),
    },
    {
      id: 'product-2',
      supplierId: null,
      category: SaleProductCategory.HOTEL,
      description: 'London hotel',
      estimatedSupplierCost: new Prisma.Decimal('150.00'),
    },
  ],
};

function createdBooking(data: Record<string, unknown>) {
  return {
    id: 'booking-1',
    operationsOwnerId: null,
    status: BookingStatus.NEW,
    travelStatus: TravelStatus.UPCOMING,
    operationsStatus: OperationsStatus.PENDING,
    accountsStatus: AccountsStatus.NOT_STARTED,
    folderStatus: FolderStatus.OPEN,
    supplierCost: null,
    ...data,
  };
}

function service(prisma: PrismaService, audit: AuditService) {
  return new BookingsService(
    prisma,
    audit,
    { create: jest.fn() } as unknown as NotificationsService,
    {} as BookingLifecycleService,
    {} as HrLaunchService,
  );
}

describe('BookingsService Batch 05 workflow', () => {
  it('creates one padded folder and traces submitted products without duplicating the CRM customer', async () => {
    const bookingCreates: Array<Record<string, unknown>> = [];
    const operationalProducts: Array<Record<string, unknown>> = [];
    const transaction = {
      saleSubmission: { findUnique: jest.fn().mockResolvedValue(sale) },
      folderCounter: {
        upsert: jest.fn().mockResolvedValue({ year: 2026, nextNumber: 7 }),
      },
      booking: {
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          bookingCreates.push(data);
          return Promise.resolve(createdBooking(data));
        }),
      },
      bookingSupplier: {
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          operationalProducts.push(data);
          return Promise.resolve({ id: 'booking-product-1', ...data });
        }),
      },
      marketingAttribution: { updateMany: jest.fn() },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      customer: { create: jest.fn() },
    };
    const bookings = service(
      {
        $transaction: jest.fn(
          (operation: (tx: typeof transaction) => unknown) =>
            operation(transaction),
        ),
      } as unknown as PrismaService,
      { log: jest.fn() } as unknown as AuditService,
    );

    await bookings.createFromSale(sale.id, admin);

    expect(bookingCreates).toHaveLength(1);
    expect(bookingCreates[0]).toMatchObject({
      folderNumber: 'NT-2026-000007',
      customerId: sale.customerId,
      leadId: sale.leadId,
      saleSubmissionId: sale.id,
      salesAdvisorId: sale.submittedByUserId,
    });
    expect(operationalProducts).toHaveLength(1);
    expect(operationalProducts[0]).toMatchObject({
      sourceSaleProductId: 'product-1',
      category: SaleProductCategory.INTERNATIONAL_FLIGHT,
      estimatedSupplierCost: sale.products[0].estimatedSupplierCost,
    });
    expect(transaction.customer.create).not.toHaveBeenCalled();
  });

  it('rejects repeated booking creation before allocating another folder number', async () => {
    const folderUpsert = jest.fn();
    const transaction = {
      saleSubmission: {
        findUnique: jest.fn().mockResolvedValue({
          ...sale,
          booking: { id: 'existing-booking' },
        }),
      },
      folderCounter: { upsert: folderUpsert },
    };
    const bookings = service(
      {
        $transaction: jest.fn(
          (operation: (tx: typeof transaction) => unknown) =>
            operation(transaction),
        ),
      } as unknown as PrismaService,
      {} as AuditService,
    );

    await expect(
      bookings.createFromSale(sale.id, admin),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(folderUpsert).not.toHaveBeenCalled();
  });

  it('reassigns only operational ownership and preserves the Sales Advisor', async () => {
    const existing = {
      ...createdBooking({
        id: 'booking-1',
        folderNumber: 'NT-2026-000007',
        customerId: sale.customerId,
        leadId: sale.leadId,
        saleSubmissionId: sale.id,
        destination: sale.destination,
        travelStartDate: sale.travelStartDate,
        travelEndDate: sale.travelEndDate,
        finalServiceDate: sale.travelEndDate,
        sellingPrice: sale.sellingPrice,
        currency: sale.currency,
        createdById: admin.id,
      }),
      salesAdvisorId: sale.submittedByUserId,
      operationsOwnerId: 'old-owner',
    };
    const updates: Array<Record<string, unknown>> = [];
    const transaction = {
      booking: {
        findUnique: jest.fn().mockResolvedValue(existing),
        update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return Promise.resolve({ ...existing, ...data });
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'new-owner',
          isActive: true,
          roles: [
            {
              role: {
                permissions: [
                  { permission: { code: 'booking.operations.complete' } },
                ],
              },
            },
          ],
        }),
      },
      employee: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const auditLog = jest.fn();
    const audit = { log: auditLog } as unknown as AuditService;
    const bookings = service(
      {
        $transaction: jest.fn(
          (operation: (tx: typeof transaction) => unknown) =>
            operation(transaction),
        ),
      } as unknown as PrismaService,
      audit,
    );

    await bookings.assignOperations(
      existing.id,
      { userId: 'new-owner' },
      admin,
    );

    expect(updates).toEqual([{ operationsOwnerId: 'new-owner' }]);
    expect(existing.salesAdvisorId).toBe(sale.submittedByUserId);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OPERATIONS_OWNER_REASSIGNED',
        oldValues: { operationsOwnerId: 'old-owner' },
        newValues: { operationsOwnerId: 'new-owner' },
      }),
      transaction,
    );
  });

  it('keeps multiple passengers in the folder with their operational notes', async () => {
    const passengers: Array<Record<string, unknown>> = [];
    const transaction = {
      booking: {
        findUnique: jest.fn().mockResolvedValue({
          salesAdvisorId: sale.submittedByUserId,
          operationsOwnerId: null,
          folderStatus: FolderStatus.OPEN,
        }),
      },
      passenger: {
        updateMany: jest.fn(),
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          passengers.push(data);
          return Promise.resolve({
            id: `passenger-${passengers.length}`,
            passportNumber: null,
            ...data,
          });
        }),
      },
      customer: { create: jest.fn() },
    };
    const bookings = service(
      {
        $transaction: jest.fn(
          (operation: (tx: typeof transaction) => unknown) =>
            operation(transaction),
        ),
      } as unknown as PrismaService,
      { log: jest.fn() } as unknown as AuditService,
    );

    await bookings.addPassenger(
      'booking-1',
      {
        firstName: 'John',
        lastName: 'Passenger',
        operationalNotes: '  Wheelchair assistance requested.  ',
      },
      admin,
    );
    await bookings.addPassenger(
      'booking-1',
      { firstName: 'Jane', lastName: 'Passenger' },
      admin,
    );

    expect(passengers).toHaveLength(2);
    expect(passengers[0]).toMatchObject({
      bookingId: 'booking-1',
      operationalNotes: 'Wheelchair assistance requested.',
    });
    expect(transaction.customer.create).not.toHaveBeenCalled();
  });

  it('supports multiple operational references linked to the correct product', async () => {
    const references: Array<Record<string, unknown>> = [];
    const transaction = {
      booking: {
        findUnique: jest.fn().mockResolvedValue({
          salesAdvisorId: sale.submittedByUserId,
          operationsOwnerId: null,
          folderStatus: FolderStatus.OPEN,
        }),
      },
      bookingSupplier: {
        findFirst: jest.fn().mockResolvedValue({ supplierId: 'supplier-1' }),
      },
      bookingReference: {
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          references.push(data);
          return Promise.resolve({
            id: `reference-${references.length}`,
            ...data,
          });
        }),
      },
    };
    const bookings = service(
      {
        $transaction: jest.fn(
          (operation: (tx: typeof transaction) => unknown) =>
            operation(transaction),
        ),
      } as unknown as PrismaService,
      { log: jest.fn() } as unknown as AuditService,
    );

    await bookings.addReference(
      'booking-1',
      {
        type: BookingReferenceType.PNR,
        reference: 'RP/CMBTEST\n  1. TEST/JOHN',
        bookingSupplierId: 'booking-product-1',
      },
      admin,
    );
    await bookings.addReference(
      'booking-1',
      {
        type: BookingReferenceType.AMADEUS_REFERENCE,
        reference: 'AMA-123',
        bookingSupplierId: 'booking-product-1',
      },
      admin,
    );

    expect(references).toHaveLength(2);
    expect(references[0]).toMatchObject({
      bookingId: 'booking-1',
      bookingSupplierId: 'booking-product-1',
      supplierId: 'supplier-1',
      reference: 'RP/CMBTEST\n  1. TEST/JOHN',
    });
  });

  it('rejects passenger modification outside booking ownership', async () => {
    const transaction = {
      booking: {
        findUnique: jest.fn().mockResolvedValue({
          salesAdvisorId: 'another-advisor',
          operationsOwnerId: null,
          folderStatus: FolderStatus.OPEN,
        }),
      },
      passenger: { create: jest.fn() },
    };
    const outsider = {
      ...admin,
      id: 'outsider',
      permissions: ['booking.view', 'booking.manage_passengers'],
    };
    const bookings = service(
      {
        $transaction: jest.fn(
          (operation: (tx: typeof transaction) => unknown) =>
            operation(transaction),
        ),
      } as unknown as PrismaService,
      {} as AuditService,
    );

    await expect(
      bookings.addPassenger(
        'booking-1',
        { firstName: 'John', lastName: 'Passenger' },
        outsider,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction.passenger.create).not.toHaveBeenCalled();
  });

  it('updates one product status independently and audits the previous value', async () => {
    const auditLog = jest.fn();
    const transaction = {
      booking: {
        findUnique: jest.fn().mockResolvedValue({
          salesAdvisorId: 'advisor-1',
          operationsOwnerId: null,
          folderStatus: FolderStatus.OPEN,
        }),
      },
      bookingSupplier: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'product-1',
          status: BookingSupplierStatus.PENDING,
        }),
        update: jest.fn().mockResolvedValue({
          id: 'product-1',
          status: BookingSupplierStatus.BOOKED_PAID,
          supplier: {},
        }),
      },
    };
    const bookings = service(
      {
        $transaction: jest.fn(
          (operation: (tx: typeof transaction) => unknown) =>
            operation(transaction),
        ),
      } as unknown as PrismaService,
      { log: auditLog } as unknown as AuditService,
    );

    await bookings.updateProductStatus(
      'booking-1',
      'product-1',
      {
        status: BookingSupplierStatus.BOOKED_PAID,
        notes: 'Supplier receipt verified',
      },
      admin,
    );

    expect(transaction.bookingSupplier.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: BookingSupplierStatus.BOOKED_PAID },
      }),
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'BookingSupplier',
        action: 'PRODUCT_STATUS_CHANGED',
        oldValues: { status: BookingSupplierStatus.PENDING },
        newValues: {
          status: BookingSupplierStatus.BOOKED_PAID,
          notes: 'Supplier receipt verified',
        },
      }),
      transaction,
    );
    expect(transaction.booking.findUnique).toHaveBeenCalledTimes(1);
  });

  it('records and resolves schedule changes without changing booking finance or completion', async () => {
    const booking = {
      salesAdvisorId: 'advisor-1',
      operationsOwnerId: null,
      folderStatus: FolderStatus.OPEN,
      folderNumber: 'NT-2026-000007',
    };
    const product = { id: 'product-1', status: BookingSupplierStatus.PENDING };
    const productUpdates: Array<Record<string, unknown>> = [];
    const transaction = {
      booking: {
        findUnique: jest.fn().mockResolvedValue(booking),
        update: jest.fn(),
      },
      bookingSupplier: {
        findFirst: jest.fn().mockResolvedValue(product),
        update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          productUpdates.push(data);
          return Promise.resolve({ ...product, ...data });
        }),
      },
      bookingProductIssue: {
        create: jest.fn().mockResolvedValue({
          id: 'issue-1',
          type: BookingProductIssueType.SCHEDULE_CHANGE,
        }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'issue-1',
          bookingSupplierId: 'product-1',
          type: BookingProductIssueType.SCHEDULE_CHANGE,
          status: 'OPEN',
          bookingSupplier: product,
        }),
        update: jest
          .fn()
          .mockResolvedValue({ id: 'issue-1', status: 'RESOLVED' }),
      },
    };
    const bookings = service(
      {
        $transaction: jest.fn(
          (operation: (tx: typeof transaction) => unknown) =>
            operation(transaction),
        ),
      } as unknown as PrismaService,
      { log: jest.fn() } as unknown as AuditService,
    );

    await bookings.createProductIssue(
      'booking-1',
      'product-1',
      {
        type: BookingProductIssueType.SCHEDULE_CHANGE,
        originalDetails: 'Flight at 10:00',
        revisedDetails: 'Flight at 14:00',
        reason: 'Airline timetable change',
      },
      admin,
    );
    await bookings.resolveProductIssue(
      'booking-1',
      'issue-1',
      { notes: 'Passenger notified' },
      admin,
    );

    expect(productUpdates).toEqual([
      { status: BookingSupplierStatus.SCHEDULE_CHANGE },
      { status: BookingSupplierStatus.SCHEDULE_CHANGE_COMPLETE },
    ]);
    expect(transaction.booking.update).not.toHaveBeenCalled();
  });

  it('applies lifecycle milestone filters without losing owner access scope', async () => {
    const count = jest
      .fn<Promise<number>, [Prisma.BookingCountArgs]>()
      .mockResolvedValue(0);
    const findMany = jest.fn().mockResolvedValue([]);
    const bookings = service(
      {
        booking: { count, findMany },
        $transaction: jest.fn().mockResolvedValue([0, []]),
      } as unknown as PrismaService,
      {} as AuditService,
    );
    const owner = {
      ...admin,
      permissions: ['booking.view'],
    };

    await bookings.findAll(
      {
        page: 1,
        limit: 20,
        milestone: BookingLifecycleMilestone.TICKET_PENDING,
      },
      owner,
    );

    const expectedWhere: Prisma.BookingWhereInput = {
      AND: [
        {
          OR: [{ salesAdvisorId: admin.id }, { operationsOwnerId: admin.id }],
        },
        {
          OR: [
            { operationsStatus: 'TICKETING_PENDING' },
            {
              productIssues: {
                some: {
                  status: 'OPEN',
                  type: BookingProductIssueType.TICKET_ISSUANCE_PENDING,
                },
              },
            },
          ],
        },
      ],
    };
    expect(count).toHaveBeenCalledWith({ where: expectedWhere });
  });

  it('rejects product status changes outside booking ownership', async () => {
    const update = jest.fn();
    const transaction = {
      booking: {
        findUnique: jest.fn().mockResolvedValue({
          salesAdvisorId: 'another-advisor',
          operationsOwnerId: null,
          folderStatus: FolderStatus.OPEN,
        }),
      },
      bookingSupplier: { update },
    };
    const outsider = {
      ...admin,
      id: 'outsider',
      permissions: ['booking.view', 'booking.manage_suppliers'],
    };
    const bookings = service(
      {
        $transaction: jest.fn(
          (operation: (tx: typeof transaction) => unknown) =>
            operation(transaction),
        ),
      } as unknown as PrismaService,
      {} as AuditService,
    );

    await expect(
      bookings.updateProductStatus(
        'booking-1',
        'product-1',
        { status: BookingSupplierStatus.BOOKED_PAYMENT_PENDING },
        outsider,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it('records passenger special requests and immutable status history', async () => {
    const created: Record<string, unknown>[] = [];
    const updated: Record<string, unknown>[] = [];
    const transaction = {
      booking: {
        findUnique: jest.fn().mockResolvedValue({
          salesAdvisorId: 'advisor-1',
          operationsOwnerId: null,
          folderStatus: FolderStatus.OPEN,
          folderNumber: 'NT-2026-000007',
        }),
      },
      passenger: { findFirst: jest.fn().mockResolvedValue({ id: 'pax-1' }) },
      bookingSupplier: { findFirst: jest.fn() },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'owner-1' }) },
      bookingSpecialRequest: {
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return Promise.resolve({
            id: 'request-1',
            type: BookingSpecialRequestType.SPECIAL_ASSISTANCE,
            status: BookingSpecialRequestStatus.REQUESTED,
            passengerId: 'pax-1',
            bookingSupplierId: null,
            responsibleUserId: 'owner-1',
          });
        }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'request-1',
          status: BookingSpecialRequestStatus.REQUESTED,
        }),
        update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          updated.push(data);
          return Promise.resolve({
            id: 'request-1',
            status: BookingSpecialRequestStatus.SUPPLIER_CONFIRMED,
          });
        }),
      },
      notification: { create: jest.fn() },
    };
    const bookings = service(
      {
        $transaction: jest.fn(
          (operation: (tx: typeof transaction) => unknown) =>
            operation(transaction),
        ),
      } as unknown as PrismaService,
      { log: jest.fn() } as unknown as AuditService,
    );

    await bookings.createSpecialRequest(
      'booking-1',
      {
        type: BookingSpecialRequestType.SPECIAL_ASSISTANCE,
        details: 'Wheelchair at departure and arrival',
        passengerId: 'pax-1',
        responsibleUserId: 'owner-1',
      },
      admin,
    );

    expect(created[0]).toMatchObject({
      bookingId: 'booking-1',
      passengerId: 'pax-1',
      history: {
        create: {
          newStatus: BookingSpecialRequestStatus.REQUESTED,
          changedById: admin.id,
        },
      },
    });

    await bookings.updateSpecialRequest(
      'booking-1',
      'request-1',
      {
        status: BookingSpecialRequestStatus.SUPPLIER_CONFIRMED,
        notes: 'Confirmed by airline',
      },
      admin,
    );
    expect(updated[0]).toMatchObject({
      status: BookingSpecialRequestStatus.SUPPLIER_CONFIRMED,
      confirmedById: admin.id,
      history: {
        create: {
          previousStatus: BookingSpecialRequestStatus.REQUESTED,
          newStatus: BookingSpecialRequestStatus.SUPPLIER_CONFIRMED,
        },
      },
    });
  });

  it('persists checklist verification without changing booking status', async () => {
    const bookingUpdate = jest.fn();
    const checklistUpserts: Array<{ create: Record<string, unknown> }> = [];
    const transaction = {
      booking: {
        findUnique: jest.fn().mockResolvedValue({
          salesAdvisorId: 'advisor-1',
          operationsOwnerId: null,
          folderStatus: FolderStatus.OPEN,
        }),
        update: bookingUpdate,
      },
      bookingChecklistItem: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn((args: { create: Record<string, unknown> }) => {
          checklistUpserts.push(args);
          return Promise.resolve({
            itemType: BookingChecklistItemType.PAX_NAMES,
            state: BookingChecklistState.CHECKED,
          });
        }),
      },
    };
    const bookings = service(
      {
        $transaction: jest.fn(
          (operation: (tx: typeof transaction) => unknown) =>
            operation(transaction),
        ),
      } as unknown as PrismaService,
      { log: jest.fn() } as unknown as AuditService,
    );

    await bookings.updateChecklistItem(
      'booking-1',
      {
        itemType: BookingChecklistItemType.PAX_NAMES,
        state: BookingChecklistState.CHECKED,
        notes: 'Matched passport spelling',
      },
      admin,
    );

    expect(checklistUpserts[0].create).toMatchObject({
      checkedById: admin.id,
      state: BookingChecklistState.CHECKED,
    });
    expect(bookingUpdate).not.toHaveBeenCalled();
  });

  it('stores valid private PDF bytes and rejects cross-booking passenger links', async () => {
    const documentCreates: Record<string, unknown>[] = [];
    const documentCreate = jest.fn(
      ({ data }: { data: Record<string, unknown> }) => {
        documentCreates.push(data);
        return Promise.resolve({
          id: 'document-1',
          revisionNumber: 1,
          createdAt: new Date(),
          deletedAt: null,
          deletedById: null,
          revisionRootId: null,
          storageKey: null,
          passengerPaymentId: null,
          supplierPaymentId: null,
          voucherId: null,
          ...data,
        });
      },
    );
    const transaction = {
      booking: {
        findUnique: jest.fn().mockResolvedValue({
          salesAdvisorId: 'advisor-1',
          operationsOwnerId: null,
          folderStatus: FolderStatus.OPEN,
        }),
      },
      passenger: { findFirst: jest.fn().mockResolvedValue({ id: 'pax-1' }) },
      bookingSupplier: { findFirst: jest.fn() },
      user: { findFirst: jest.fn() },
      bookingDocument: { create: documentCreate },
    };
    const bookings = service(
      {
        $transaction: jest.fn(
          (operation: (tx: typeof transaction) => unknown) =>
            operation(transaction),
        ),
      } as unknown as PrismaService,
      { log: jest.fn() } as unknown as AuditService,
    );
    const file = {
      originalname: '../ticket.pdf',
      mimetype: 'application/pdf',
      size: 12,
      buffer: Buffer.from('%PDF-1.7 test'),
    };

    await bookings.uploadDocument(
      'booking-1',
      { category: 'E_TICKET', passengerId: 'pax-1' },
      file,
      admin,
    );
    expect(documentCreates[0]).toMatchObject({
      fileName: 'ticket.pdf',
      content: Uint8Array.from(file.buffer),
      passengerId: 'pax-1',
    });

    transaction.passenger.findFirst.mockResolvedValueOnce(null);
    await expect(
      bookings.uploadDocument(
        'booking-1',
        { category: 'PASSENGER_DOCUMENT', passengerId: 'other-pax' },
        file,
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects executable content disguised as a PDF', async () => {
    const bookings = service({} as PrismaService, {} as AuditService);
    await expect(
      bookings.uploadDocument(
        'booking-1',
        { category: 'E_TICKET' },
        {
          originalname: 'ticket.pdf',
          mimetype: 'application/pdf',
          size: 7,
          buffer: Buffer.from('MZ fake'),
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a new document revision without overwriting the original', async () => {
    const original = {
      id: 'document-1',
      bookingId: 'booking-1',
      passengerId: null,
      bookingSupplierId: null,
      revisionRootId: null,
      revisionNumber: 1,
      category: 'BOOKING_CONFIRMATION',
      deletedAt: null,
    };
    const documentCreates: Record<string, unknown>[] = [];
    const documentCreate = jest.fn(
      ({ data }: { data: Record<string, unknown> }) => {
        documentCreates.push(data);
        return Promise.resolve({
          ...original,
          ...data,
          id: 'document-2',
          fileName: 'confirmation-v2.pdf',
          fileType: 'application/pdf',
          fileSize: 12,
          content: Uint8Array.from(Buffer.from('%PDF-1.7 v2')),
          storageKey: null,
          notes: null,
          uploadedById: admin.id,
          deletedById: null,
          createdAt: new Date(),
        });
      },
    );
    const transaction = {
      booking: {
        findUnique: jest.fn().mockResolvedValue({
          salesAdvisorId: 'advisor-1',
          operationsOwnerId: null,
          folderStatus: FolderStatus.OPEN,
        }),
      },
      passenger: { findFirst: jest.fn() },
      bookingSupplier: { findFirst: jest.fn() },
      user: { findFirst: jest.fn() },
      bookingDocument: {
        findFirst: jest.fn().mockResolvedValue(original),
        aggregate: jest.fn().mockResolvedValue({
          _max: { revisionNumber: 1 },
        }),
        create: documentCreate,
      },
    };
    const bookings = service(
      {
        $transaction: jest.fn(
          (operation: (tx: typeof transaction) => unknown) =>
            operation(transaction),
        ),
      } as unknown as PrismaService,
      { log: jest.fn() } as unknown as AuditService,
    );

    await bookings.replaceDocument(
      'booking-1',
      original.id,
      { category: 'BOOKING_CONFIRMATION' },
      {
        originalname: 'confirmation-v2.pdf',
        mimetype: 'application/pdf',
        size: 12,
        buffer: Buffer.from('%PDF-1.7 v2'),
      },
      admin,
    );

    expect(documentCreates[0]).toMatchObject({
      revisionRootId: original.id,
      revisionNumber: 2,
    });
    expect(transaction.bookingDocument.findFirst).toHaveBeenCalledTimes(1);
  });

  it('blocks passenger document reads without passenger permission', async () => {
    const bookings = service(
      {
        bookingDocument: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'document-1',
            bookingId: 'booking-1',
            passengerId: 'pax-1',
            category: 'PASSENGER_DOCUMENT',
            content: Uint8Array.from(Buffer.from('%PDF-1.7 test')),
            fileName: 'passport.pdf',
            fileType: 'application/pdf',
            fileSize: 12,
            deletedAt: null,
            booking: {
              salesAdvisorId: 'advisor-1',
              operationsOwnerId: null,
            },
          }),
        },
      } as unknown as PrismaService,
      {} as AuditService,
    );
    const viewer = {
      ...admin,
      permissions: ['booking.view', 'booking.view_all'],
    };

    await expect(
      bookings.getDocument('booking-1', 'document-1', viewer),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
