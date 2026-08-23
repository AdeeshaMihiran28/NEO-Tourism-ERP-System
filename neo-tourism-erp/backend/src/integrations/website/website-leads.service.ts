import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import {
  IntegrationEventDirection,
  IntegrationEventStatus,
  IntegrationProviderType,
  IntegrationStatus,
  LeadActivityType,
  Prisma,
} from '../../../generated/prisma/client';
import { AuditService } from '../../audit/audit.service';
import type { RequestMetadata } from '../../common/request-metadata';
import { PrismaService } from '../../prisma/prisma.service';
import type { WebsiteLeadDto } from './dto/website-lead.dto';

const WEBSITE_PROVIDER_NAME = 'Neo Tourism Website';

@Injectable()
export class WebsiteLeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async receive(
    dto: WebsiteLeadDto,
    suppliedSecret: string | undefined,
    metadata?: RequestMetadata,
  ) {
    const provider = await this.provider();
    const actor = await this.systemUser();
    if (!validSecret(suppliedSecret, process.env.WEBSITE_WEBHOOK_SECRET)) {
      const event = await this.recordRejected(
        provider.id,
        dto.externalReference,
      );
      if (event)
        await this.audit.log({
          actorUserId: actor.id,
          entityType: 'IntegrationEvent',
          entityId: event.id,
          action: 'WEB_LEAD_REJECTED',
          metadata: { provider: 'WEBSITE', reason: 'INVALID_WEBHOOK_SECRET' },
          requestMetadata: metadata,
        });
      throw new ForbiddenException('Invalid website webhook credentials.');
    }
    if (!dto.email?.trim() && !dto.phone?.trim())
      throw new ForbiddenException('Email or phone is required.');

    let event;
    try {
      event = await this.prisma.integrationEvent.create({
        data: {
          providerId: provider.id,
          direction: IntegrationEventDirection.INBOUND,
          eventType: 'WEBSITE_LEAD',
          externalReference: dto.externalReference?.trim(),
          status: IntegrationEventStatus.PENDING,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        dto.externalReference
      ) {
        const existing = await this.prisma.integrationEvent.findFirstOrThrow({
          where: {
            providerId: provider.id,
            eventType: 'WEBSITE_LEAD',
            externalReference: dto.externalReference.trim(),
          },
        });
        return {
          duplicate: true,
          leadId: existing.internalEntityId,
          status: existing.status,
        };
      }
      throw error;
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const email = dto.email?.trim().toLowerCase();
        const phone = dto.phone?.trim();
        const customer =
          (await tx.customer.findFirst({
            where: {
              OR: [
                ...(email ? [{ email }] : []),
                ...(phone ? [{ phone }] : []),
              ],
            },
            orderBy: { createdAt: 'asc' },
          })) ??
          (await tx.customer.create({
            data: {
              firstName: dto.firstName.trim(),
              lastName: dto.lastName.trim(),
              email,
              phone,
              createdById: actor.id,
              updatedById: actor.id,
            },
          }));
        const lead = await tx.lead.create({
          data: {
            customerId: customer.id,
            source: 'WEBSITE',
            destination: dto.destination?.trim(),
            travelDate: dto.travelDate
              ? new Date(`${dto.travelDate.slice(0, 10)}T00:00:00.000Z`)
              : undefined,
            summary: dto.message?.trim(),
            createdById: actor.id,
          },
        });
        await tx.leadActivity.create({
          data: {
            leadId: lead.id,
            userId: actor.id,
            type: LeadActivityType.LEAD_CREATED,
            description: 'Lead received from Neo Tourism website.',
            metadata: {
              source: 'WEBSITE',
              externalReference: dto.externalReference ?? null,
            },
          },
        });
        await tx.integrationEvent.update({
          where: { id: event.id },
          data: {
            status: IntegrationEventStatus.SUCCESS,
            internalEntityType: 'Lead',
            internalEntityId: lead.id,
          },
        });
        await tx.integrationProvider.update({
          where: { id: provider.id },
          data: {
            status: IntegrationStatus.CONNECTED,
            isEnabled: true,
            lastCheckedAt: new Date(),
            lastSuccessAt: new Date(),
            lastErrorMessage: null,
          },
        });
        await this.audit.log(
          {
            actorUserId: actor.id,
            entityType: 'IntegrationEvent',
            entityId: event.id,
            action: 'WEB_LEAD_RECEIVED',
            newValues: {
              leadId: lead.id,
              customerId: customer.id,
              source: 'WEBSITE',
            },
            requestMetadata: metadata,
          },
          tx,
        );
        return {
          duplicate: false,
          customerId: customer.id,
          leadId: lead.id,
          status: IntegrationEventStatus.SUCCESS,
        };
      });
      return result;
    } catch {
      await this.prisma.integrationEvent.update({
        where: { id: event.id },
        data: {
          status: IntegrationEventStatus.FAILED,
          errorMessage: 'Website lead processing failed.',
        },
      });
      await this.prisma.integrationProvider.update({
        where: { id: provider.id },
        data: {
          status: IntegrationStatus.ERROR,
          lastCheckedAt: new Date(),
          lastErrorAt: new Date(),
          lastErrorMessage: 'Website lead processing failed.',
        },
      });
      throw new ServiceUnavailableException(
        'Website lead could not be processed.',
      );
    }
  }

  private provider() {
    const configured = Boolean(process.env.WEBSITE_WEBHOOK_SECRET?.trim());
    return this.prisma.integrationProvider.upsert({
      where: {
        type_name: {
          type: IntegrationProviderType.WEBSITE,
          name: WEBSITE_PROVIDER_NAME,
        },
      },
      create: {
        type: IntegrationProviderType.WEBSITE,
        name: WEBSITE_PROVIDER_NAME,
        isEnabled: configured,
        status: configured
          ? IntegrationStatus.CONNECTED
          : IntegrationStatus.NOT_CONFIGURED,
      },
      update: {
        lastCheckedAt: new Date(),
        ...(!configured && {
          isEnabled: false,
          status: IntegrationStatus.NOT_CONFIGURED,
        }),
      },
    });
  }

  private async systemUser() {
    const email = (
      process.env.INTEGRATION_SYSTEM_USER_EMAIL ?? process.env.SEED_ADMIN_EMAIL
    )
      ?.trim()
      .toLowerCase();
    const user = email
      ? await this.prisma.user.findUnique({ where: { email } })
      : await this.prisma.user.findFirst({
          where: {
            isActive: true,
            roles: { some: { role: { name: 'SUPER_ADMIN' } } },
          },
          orderBy: { createdAt: 'asc' },
        });
    if (!user)
      throw new ServiceUnavailableException(
        'Integration system user is not configured.',
      );
    return user;
  }

  private async recordRejected(providerId: string, externalReference?: string) {
    try {
      return await this.prisma.integrationEvent.create({
        data: {
          providerId,
          direction: IntegrationEventDirection.INBOUND,
          eventType: 'WEBSITE_LEAD_REJECTED',
          externalReference: externalReference?.trim(),
          status: IntegrationEventStatus.FAILED,
          errorMessage: 'Invalid webhook credentials.',
        },
      });
    } catch {
      return null;
    }
  }
}

function validSecret(supplied?: string, configured?: string) {
  if (!supplied || !configured?.trim()) return false;
  const left = Buffer.from(supplied);
  const right = Buffer.from(configured);
  return left.length === right.length && timingSafeEqual(left, right);
}
