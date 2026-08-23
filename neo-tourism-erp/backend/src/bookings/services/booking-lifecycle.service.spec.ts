import { BookingLifecycleService } from './booking-lifecycle.service';
import type { AuditService } from '../../audit/audit.service';
import type { NotificationsService } from '../../notifications/notifications.service';
import type { PrismaService } from '../../prisma/prisma.service';

describe('BookingLifecycleService travel evaluation', () => {
  const service = new BookingLifecycleService(
    {} as PrismaService,
    {} as AuditService,
    {} as NotificationsService,
  );
  const now = new Date('2026-08-22T15:00:00.000Z');

  it('keeps a future booking upcoming', () => {
    expect(
      service.evaluateTravelStatus(
        {
          travelStatus: 'UPCOMING',
          travelStartDate: new Date('2026-08-23'),
          travelEndDate: new Date('2026-08-25'),
          finalServiceDate: null,
        },
        now,
      ),
    ).toBe('UPCOMING');
  });

  it('marks a booking in travel on its travel date', () => {
    expect(
      service.evaluateTravelStatus(
        {
          travelStatus: 'UPCOMING',
          travelStartDate: new Date('2026-08-22'),
          travelEndDate: new Date('2026-08-25'),
          finalServiceDate: null,
        },
        now,
      ),
    ).toBe('IN_TRAVEL');
  });

  it('marks travel complete after the effective final date', () => {
    expect(
      service.evaluateTravelStatus(
        {
          travelStatus: 'IN_TRAVEL',
          travelStartDate: new Date('2026-08-10'),
          travelEndDate: new Date('2026-08-20'),
          finalServiceDate: new Date('2026-08-21'),
        },
        now,
      ),
    ).toBe('TRAVEL_COMPLETE');
  });

  it('never overwrites cancelled travel', () => {
    expect(
      service.evaluateTravelStatus(
        {
          travelStatus: 'CANCELLED',
          travelStartDate: new Date('2026-08-10'),
          travelEndDate: new Date('2026-08-20'),
          finalServiceDate: null,
        },
        now,
      ),
    ).toBe('CANCELLED');
  });
});
