import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class PulseWorkloadService {
  constructor(private readonly prisma: PrismaService) {}
  async get(now = new Date()) {
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const tomorrow = new Date(today.getTime() + 86400000);
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        assignedMarketingContent: {
          some: { stage: { notIn: ['LIVE', 'ARCHIVED', 'CANCELLED'] } },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        assignedMarketingContent: {
          where: { stage: { notIn: ['LIVE', 'ARCHIVED', 'CANCELLED'] } },
          select: { stage: true, deadline: true },
        },
      },
    });
    return users
      .map((user) => ({
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        assigned: user.assignedMarketingContent.length,
        creating: user.assignedMarketingContent.filter(
          (x) => x.stage === 'CREATING',
        ).length,
        inReview: user.assignedMarketingContent.filter(
          (x) => x.stage === 'REVIEW',
        ).length,
        dueToday: user.assignedMarketingContent.filter(
          (x) => x.deadline && x.deadline >= today && x.deadline < tomorrow,
        ).length,
        overdue: user.assignedMarketingContent.filter(
          (x) => x.deadline && x.deadline < today,
        ).length,
      }))
      .sort((a, b) => b.overdue - a.overdue || b.assigned - a.assigned);
  }
}
