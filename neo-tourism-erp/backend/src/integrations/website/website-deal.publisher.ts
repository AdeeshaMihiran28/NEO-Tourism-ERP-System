import { Injectable } from '@nestjs/common';
import {
  IntegrationEventStatus,
  IntegrationProviderType,
  IntegrationStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { integrationHttpTimeoutMs } from '../integration-http.config';

export type WebsitePublishResult =
  | { status: 'SUCCESS' }
  | { status: 'NOT_CONFIGURED' }
  | { status: 'FAILED'; message: string };

type DealPayload = {
  id: string;
  dealCode: string;
  title: string;
  destination: string;
  price: unknown;
  currency: string;
  expiryAt: Date;
  updatedAt: Date;
};

@Injectable()
export class WebsiteDealPublisher {
  constructor(private readonly prisma: PrismaService) {}

  publishDeal(deal: DealPayload) {
    return this.send('PUBLISH', 'POST', deal);
  }

  updateDeal(deal: DealPayload) {
    return this.send('UPDATE', 'PATCH', deal);
  }

  unpublishDeal(deal: DealPayload) {
    return this.send('UNPUBLISH', 'DELETE', deal);
  }

  private async send(
    operation: 'PUBLISH' | 'UPDATE' | 'UNPUBLISH',
    method: 'POST' | 'PATCH' | 'DELETE',
    deal: DealPayload,
  ): Promise<WebsitePublishResult> {
    const baseUrl = process.env.WEBSITE_DEALS_API_URL?.trim().replace(
      /\/$/,
      '',
    );
    const token = process.env.WEBSITE_DEALS_API_TOKEN?.trim();
    const configured = Boolean(baseUrl && token);
    const provider = await this.prisma.integrationProvider.upsert({
      where: {
        type_name: {
          type: IntegrationProviderType.WEBSITE,
          name: 'Neo Tourism Website',
        },
      },
      create: {
        type: IntegrationProviderType.WEBSITE,
        name: 'Neo Tourism Website',
        isEnabled: configured,
        status: configured
          ? IntegrationStatus.CONNECTED
          : IntegrationStatus.NOT_CONFIGURED,
      },
      update: {},
    });
    const externalReference = `${deal.id}:${operation}:${deal.updatedAt.getTime()}`;
    const event = await this.prisma.integrationEvent.upsert({
      where: {
        providerId_eventType_externalReference: {
          providerId: provider.id,
          eventType: `MARKETING_DEAL_${operation}`,
          externalReference,
        },
      },
      create: {
        providerId: provider.id,
        direction: 'OUTBOUND',
        eventType: `MARKETING_DEAL_${operation}`,
        externalReference,
        internalEntityType: 'MarketingDeal',
        internalEntityId: deal.id,
        status: configured
          ? IntegrationEventStatus.PENDING
          : IntegrationEventStatus.IGNORED,
        ...(!configured && { errorMessage: 'Website API is not configured.' }),
      },
      update: {},
    });
    if (event.status === IntegrationEventStatus.SUCCESS)
      return { status: 'SUCCESS' };
    if (!configured) return { status: 'NOT_CONFIGURED' };

    try {
      const response = await fetch(`${baseUrl}/deals/${deal.dealCode}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        ...(method !== 'DELETE' && {
          body: JSON.stringify({
            dealCode: deal.dealCode,
            title: deal.title,
            destination: deal.destination,
            price: String(deal.price),
            currency: deal.currency,
            expiryAt: deal.expiryAt.toISOString(),
          }),
        }),
        signal: AbortSignal.timeout(integrationHttpTimeoutMs()),
      });
      if (!response.ok)
        throw new Error(`Website API returned HTTP ${response.status}.`);
      await this.prisma.$transaction([
        this.prisma.integrationEvent.update({
          where: { id: event.id },
          data: { status: IntegrationEventStatus.SUCCESS, errorMessage: null },
        }),
        this.prisma.integrationProvider.update({
          where: { id: provider.id },
          data: {
            status: IntegrationStatus.CONNECTED,
            lastSuccessAt: new Date(),
            lastCheckedAt: new Date(),
            lastErrorMessage: null,
          },
        }),
      ]);
      return { status: 'SUCCESS' };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Website request failed.';
      await this.prisma.$transaction([
        this.prisma.integrationEvent.update({
          where: { id: event.id },
          data: {
            status: IntegrationEventStatus.FAILED,
            errorMessage: message,
          },
        }),
        this.prisma.integrationProvider.update({
          where: { id: provider.id },
          data: {
            status: IntegrationStatus.ERROR,
            lastErrorAt: new Date(),
            lastCheckedAt: new Date(),
            lastErrorMessage: message,
          },
        }),
      ]);
      return { status: 'FAILED', message };
    }
  }
}
