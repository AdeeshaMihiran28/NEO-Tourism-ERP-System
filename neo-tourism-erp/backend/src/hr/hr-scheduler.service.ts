import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  EmployeeDocumentVisibility,
  NotificationType,
} from '../../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HrSchedulerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM, {
    name: 'employee-document-expiry-evaluation',
  })
  async evaluateDocumentExpiry(now = new Date()) {
    const today = utcDay(now);
    const inThirtyDays = new Date(today);
    inThirtyDays.setUTCDate(inThirtyDays.getUTCDate() + 30);
    const documents = await this.prisma.employeeDocument.findMany({
      where: { expiryDate: { not: null, lte: inThirtyDays } },
      include: { employee: true },
    });
    let created = 0;
    for (const document of documents) {
      const expired = document.expiryDate! < today;
      const type = expired
        ? NotificationType.EMPLOYEE_DOCUMENT_EXPIRED
        : NotificationType.EMPLOYEE_DOCUMENT_EXPIRING;
      const recipients = new Set<string>();
      if (
        document.employee.userId &&
        document.visibility === EmployeeDocumentVisibility.EMPLOYEE
      )
        recipients.add(document.employee.userId);
      const hrUsers = await this.prisma.user.findMany({
        where: {
          isActive: true,
          roles: {
            some: {
              role: {
                permissions: {
                  some: { permission: { code: 'hr.document.manage' } },
                },
              },
            },
          },
        },
        select: { id: true },
      });
      hrUsers.forEach(({ id }) => recipients.add(id));
      for (const userId of recipients) {
        const existing = await this.prisma.notification.findFirst({
          where: {
            userId,
            type,
            entityType: 'EmployeeDocument',
            entityId: document.id,
            createdAt: { gte: today },
          },
        });
        if (existing) continue;
        await this.notifications.create({
          userId,
          type,
          title: expired
            ? 'Employee document expired'
            : 'Employee document expiring',
          message: `${document.fileName} ${expired ? 'has expired' : 'expires within 30 days'}.`,
          entityType: 'EmployeeDocument',
          entityId: document.id,
        });
        created += 1;
      }
    }
    return { evaluated: documents.length, notificationsCreated: created };
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM, {
    name: 'onboarding-task-due-evaluation',
  })
  async evaluateOnboardingTasks(now = new Date()) {
    const today = utcDay(now);
    const tasks = await this.prisma.onboardingTask.findMany({
      where: {
        dueDate: { not: null, lte: today },
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
    });
    let created = 0;
    for (const task of tasks) {
      const recipients = task.assignedUserId
        ? [{ id: task.assignedUserId }]
        : task.assignedRole
          ? await this.prisma.user.findMany({
              where: {
                isActive: true,
                roles: { some: { role: { name: task.assignedRole } } },
              },
              select: { id: true },
            })
          : [];
      for (const { id: userId } of recipients) {
        const existing = await this.prisma.notification.findFirst({
          where: {
            userId,
            type: NotificationType.ONBOARDING_TASK_DUE,
            entityType: 'OnboardingTask',
            entityId: task.id,
            createdAt: { gte: today },
          },
        });
        if (existing) continue;
        await this.notifications.create({
          userId,
          type: NotificationType.ONBOARDING_TASK_DUE,
          title: 'Onboarding task due',
          message: task.title,
          entityType: 'OnboardingTask',
          entityId: task.id,
        });
        created += 1;
      }
    }
    return { evaluated: tasks.length, notificationsCreated: created };
  }
}

function utcDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}
