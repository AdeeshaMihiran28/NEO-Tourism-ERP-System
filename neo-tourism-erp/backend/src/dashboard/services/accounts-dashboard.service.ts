import { Injectable } from '@nestjs/common';
import {
  AccountsStatus,
  DiscrepancyStatus,
  PassengerPaymentStatus,
  ReconciliationStatus,
  SupplierPaymentStatus,
  TravelStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { DashboardQueryDto } from '../dto/dashboard-query.dto';
import { dashboardDateRange, todayUtc } from './dashboard-date-range';

@Injectable()
export class AccountsDashboardService {
  constructor(private readonly prisma: PrismaService) {}
  async get(query: DashboardQueryDto, includeSensitive: boolean) {
    const { from, to } = dashboardDateRange(query);
    const today = todayUtc();
    const [
      reconciliationPending,
      inReview,
      discrepancies,
      reconciledToday,
      travelCompleteAccountsPending,
    ] = await Promise.all([
      this.prisma.reconciliation.count({
        where: { status: ReconciliationStatus.PENDING },
      }),
      this.prisma.reconciliation.count({
        where: { status: ReconciliationStatus.IN_REVIEW },
      }),
      this.prisma.reconciliationDiscrepancy.count({
        where: {
          status: {
            in: [DiscrepancyStatus.OPEN, DiscrepancyStatus.IN_PROGRESS],
          },
        },
      }),
      this.prisma.reconciliation.count({
        where: {
          status: ReconciliationStatus.RECONCILED,
          reconciledAt: { gte: today.start, lte: today.end },
        },
      }),
      this.prisma.booking.count({
        where: {
          travelStatus: TravelStatus.TRAVEL_COMPLETE,
          accountsStatus: { not: AccountsStatus.RECONCILED },
        },
      }),
    ]);
    const result: Record<string, unknown> = {
      period: { from, to },
      kpis: {
        reconciliationPending,
        inReview,
        discrepancies,
        reconciledToday,
        travelCompleteAccountsPending,
      },
    };
    if (includeSensitive)
      result.financials = await this.financialTotals(from, to);
    return result;
  }

  private async financialTotals(from: Date, to: Date) {
    const rows = await this.prisma.bookingFinance.findMany({
      where: { booking: { createdAt: { gte: from, lte: to } } },
      include: {
        booking: {
          select: {
            passengerPayments: {
              where: {
                status: {
                  in: [
                    PassengerPaymentStatus.RECEIVED,
                    PassengerPaymentStatus.VERIFIED,
                  ],
                },
              },
              select: { amount: true, currency: true },
            },
            supplierPayments: {
              where: {
                status: {
                  in: [
                    SupplierPaymentStatus.PAID,
                    SupplierPaymentStatus.VERIFIED,
                  ],
                },
              },
              select: { amount: true, currency: true },
            },
          },
        },
      },
    });
    const currencies: Record<
      string,
      {
        totalSalesValue: number;
        expectedProfit: number;
        outstandingPassengerBalance: number;
        outstandingSupplierBalance: number;
      }
    > = {};
    for (const row of rows) {
      const totals = currencies[row.currency] ?? {
        totalSalesValue: 0,
        expectedProfit: 0,
        outstandingPassengerBalance: 0,
        outstandingSupplierBalance: 0,
      };
      totals.totalSalesValue += Number(row.sellingPrice);
      totals.expectedProfit += Number(row.expectedProfit);
      const passengerReceived = row.booking.passengerPayments
        .filter((payment) => payment.currency === row.currency)
        .reduce((sum, payment) => sum + Number(payment.amount), 0);
      const supplierPaid = row.booking.supplierPayments
        .filter((payment) => payment.currency === row.currency)
        .reduce((sum, payment) => sum + Number(payment.amount), 0);
      totals.outstandingPassengerBalance += Math.max(
        0,
        Number(row.expectedRevenue) - passengerReceived,
      );
      totals.outstandingSupplierBalance += Math.max(
        0,
        Number(row.supplierCost) - supplierPaid,
      );
      currencies[row.currency] = totals;
    }
    return Object.entries(currencies).map(([currency, values]) => ({
      currency,
      ...Object.fromEntries(
        Object.entries(values).map(([key, value]) => [
          key,
          Number(value.toFixed(2)),
        ]),
      ),
    }));
  }
}
