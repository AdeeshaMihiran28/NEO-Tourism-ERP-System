import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  IntegrationEventDirection,
  IntegrationEventStatus,
  IntegrationProviderType,
  IntegrationStatus,
} from '../../../generated/prisma/client';
import { AuditService } from '../../audit/audit.service';
import type { RequestMetadata } from '../../common/request-metadata';
import { PrismaService } from '../../prisma/prisma.service';
import {
  META_MARKETING_PROVIDER,
  type MetaMarketingProvider,
} from './meta-adapter.interface';
import { metaConfiguration } from './meta.config';

@Injectable()
export class MetaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(META_MARKETING_PROVIDER)
    private readonly adapter: MetaMarketingProvider,
  ) {}
  async status() {
    const config = metaConfiguration();
    const provider = await this.ensureProvider();
    return {
      status: config.configured
        ? provider.status
        : IntegrationStatus.NOT_CONFIGURED,
      facebook: config.facebook,
      instagram: config.instagram,
      mock: config.mock,
      lastSyncedAt: provider.lastSuccessAt,
      message:
        provider.status === IntegrationStatus.ERROR ||
        provider.status === IntegrationStatus.DEGRADED
          ? 'Meta sync temporarily unavailable.'
          : null,
    };
  }
  async sync(actorId: string | null = null, metadata?: RequestMetadata) {
    const config = metaConfiguration();
    const provider = await this.ensureProvider();
    if (!config.configured)
      return {
        status: IntegrationStatus.NOT_CONFIGURED,
        synced: 0,
        message: 'Meta Business Suite is not configured.',
      };
    const reference = `sync:${new Date().toISOString()}`;
    const integrationEvent = await this.prisma.integrationEvent.create({
      data: {
        providerId: provider.id,
        direction: IntegrationEventDirection.INBOUND,
        eventType: 'MARKETING_META_SYNC',
        externalReference: reference,
        status: IntegrationEventStatus.PENDING,
      },
    });
    if (actorId)
      await this.audit.log({
        actorUserId: actorId,
        action: 'MARKETING_META_SYNC_STARTED',
        entityType: 'IntegrationProvider',
        entityId: provider.id,
        requestMetadata: metadata,
      });
    try {
      const batches = await Promise.all([
        this.adapter.getScheduledPosts(),
        this.adapter.getPublishedPosts(),
        this.adapter.getBasicCampaignActivity(),
      ]);
      const events = batches.flat();
      for (const event of events) {
        const { safeMetadata, ...normalized } = event;
        await this.prisma.externalMarketingEvent.upsert({
          where: {
            provider_externalReference: {
              provider: IntegrationProviderType.META,
              externalReference: event.externalReference,
            },
          },
          create: {
            ...normalized,
            provider: IntegrationProviderType.META,
            rawMetadataSafe: safeMetadata,
            lastSyncedAt: new Date(),
          },
          update: {
            externalType: event.externalType,
            title: event.title,
            scheduledAt: event.scheduledAt,
            publishedAt: event.publishedAt,
            status: event.status,
            channel: event.channel,
            rawMetadataSafe: safeMetadata,
            lastSyncedAt: new Date(),
          },
        });
      }
      await this.prisma.$transaction([
        this.prisma.integrationEvent.update({
          where: { id: integrationEvent.id },
          data: { status: IntegrationEventStatus.SUCCESS },
        }),
        this.prisma.integrationProvider.update({
          where: { id: provider.id },
          data: {
            status: IntegrationStatus.CONNECTED,
            isEnabled: true,
            lastCheckedAt: new Date(),
            lastSuccessAt: new Date(),
            lastErrorMessage: null,
          },
        }),
      ]);
      if (actorId)
        await this.audit.log({
          actorUserId: actorId,
          action: 'MARKETING_META_SYNC_COMPLETED',
          entityType: 'IntegrationProvider',
          entityId: provider.id,
          newValues: { synced: events.length },
          requestMetadata: metadata,
        });
      return { status: IntegrationStatus.CONNECTED, synced: events.length };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Meta sync failed.';
      await this.prisma.$transaction([
        this.prisma.integrationEvent.update({
          where: { id: integrationEvent.id },
          data: {
            status: IntegrationEventStatus.FAILED,
            errorMessage: message,
          },
        }),
        this.prisma.integrationProvider.update({
          where: { id: provider.id },
          data: {
            status: IntegrationStatus.ERROR,
            lastCheckedAt: new Date(),
            lastErrorAt: new Date(),
            lastErrorMessage: message,
          },
        }),
      ]);
      if (actorId)
        await this.audit.log({
          actorUserId: actorId,
          action: 'MARKETING_META_SYNC_FAILED',
          entityType: 'IntegrationProvider',
          entityId: provider.id,
          newValues: { message },
          requestMetadata: metadata,
        });
      return {
        status: IntegrationStatus.ERROR,
        synced: 0,
        message: 'Meta sync temporarily unavailable.',
      };
    }
  }
  @Cron(process.env.META_SYNC_CRON?.trim() || '*/30 * * * *', {
    name: 'meta-marketing-sync',
  })
  scheduledSync() {
    return metaConfiguration().configured
      ? this.sync()
      : Promise.resolve({
          status: IntegrationStatus.NOT_CONFIGURED,
          synced: 0,
        });
  }
  private async ensureProvider() {
    const config = metaConfiguration();
    const provider = await this.prisma.integrationProvider.upsert({
      where: {
        type_name: {
          type: IntegrationProviderType.META,
          name: 'Meta Business Suite',
        },
      },
      create: {
        type: IntegrationProviderType.META,
        name: 'Meta Business Suite',
        isEnabled: config.configured,
        status: config.configured
          ? config.mock
            ? IntegrationStatus.CONNECTED
            : IntegrationStatus.DEGRADED
          : IntegrationStatus.NOT_CONFIGURED,
        lastCheckedAt: new Date(),
      },
      update: !config.configured
        ? {
            isEnabled: false,
            status: IntegrationStatus.NOT_CONFIGURED,
            lastCheckedAt: new Date(),
          }
        : { isEnabled: true, lastCheckedAt: new Date() },
    });
    if (
      config.configured &&
      (provider.status === IntegrationStatus.NOT_CONFIGURED ||
        provider.status === IntegrationStatus.DISABLED)
    ) {
      return this.prisma.integrationProvider.update({
        where: { id: provider.id },
        data: {
          isEnabled: true,
          status: config.mock
            ? IntegrationStatus.CONNECTED
            : IntegrationStatus.DEGRADED,
          lastCheckedAt: new Date(),
        },
      });
    }
    return provider;
  }
}
