import { BadRequestException } from '@nestjs/common';
import type { DashboardQueryDto } from '../dto/dashboard-query.dto';

export interface DashboardDateRange {
  from: Date;
  to: Date;
}

export function dashboardDateRange(
  query: DashboardQueryDto,
): DashboardDateRange {
  const now = new Date();
  const from = query.dateFrom
    ? startUtcDay(query.dateFrom)
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = query.dateTo ? endUtcDay(query.dateTo) : now;
  if (from > to)
    throw new BadRequestException('dateFrom must not be after dateTo.');
  return { from, to };
}

export function todayUtc() {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  return { start, end: new Date(start.getTime() + 86_400_000 - 1) };
}

function startUtcDay(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function endUtcDay(value: string) {
  return new Date(`${value.slice(0, 10)}T23:59:59.999Z`);
}
