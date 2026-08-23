import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  IntegrationProviderType,
  IntegrationStatus,
} from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import type { RequestMetadata } from '../common/request-metadata';
import { PrismaService } from '../prisma/prisma.service';
import { telephonyConfigured } from './telephony/telephony.config';
import { wiseConfigured } from './wise/wise.config';

const providers = [
  { key: 'wise', type: IntegrationProviderType.WISE, name: 'Wise / Banking' },
  {
    key: 'telephony',
    type: IntegrationProviderType.TELEPHONY,
    name: 'Telephony / PBX',
  },
  {
    key: 'website',
    type: IntegrationProviderType.WEBSITE,
    name: 'Neo Tourism Website',
  },
] as const;

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async status() {
    const result: Record<string, unknown> = {};
    for (const definition of providers) {
      const provider = await this.ensureProvider(
        definition.type,
        definition.name,
      );
      result[definition.key] = {
        name: provider.name,
        status: provider.status,
        isEnabled: provider.isEnabled,
        lastCheckedAt: provider.lastCheckedAt,
        lastSuccessAt: provider.lastSuccessAt,
        lastErrorAt: provider.lastErrorAt,
        lastErrorMessage: provider.lastErrorMessage,
      };
    }
    return result;
  }

  async update(
    type: IntegrationProviderType,
    isEnabled: boolean,
    actorId: string,
    metadata?: RequestMetadata,
  ) {
    const definition = providers.find((item) => item.type === type);
    if (!definition)
      throw new NotFoundException('Integration provider not found.');
    if (isEnabled && !this.configured(type))
      throw new BadRequestException(
        `${definition.name} cannot be enabled because its environment configuration is missing.`,
      );
    const provider = await this.ensureProvider(type, definition.name);
    const updated = await this.prisma.integrationProvider.update({
      where: { id: provider.id },
      data: {
        isEnabled,
        status: isEnabled
          ? this.configuredStatus(type)
          : IntegrationStatus.DISABLED,
        lastCheckedAt: new Date(),
        ...(isEnabled &&
          type === IntegrationProviderType.WEBSITE && {
            lastSuccessAt: new Date(),
            lastErrorMessage: null,
          }),
      },
    });
    await this.audit.log({
      actorUserId: actorId,
      entityType: 'IntegrationProvider',
      entityId: updated.id,
      action: isEnabled ? 'INTEGRATION_ENABLED' : 'INTEGRATION_DISABLED',
      oldValues: { isEnabled: provider.isEnabled, status: provider.status },
      newValues: { isEnabled: updated.isEnabled, status: updated.status },
      metadata: { provider: type },
      requestMetadata: metadata,
    });
    return {
      type: updated.type,
      name: updated.name,
      status: updated.status,
      isEnabled: updated.isEnabled,
    };
  }

  private async ensureProvider(type: IntegrationProviderType, name: string) {
    const configured = this.configured(type);
    const provider = await this.prisma.integrationProvider.upsert({
      where: { type_name: { type, name } },
      create: {
        type,
        name,
        isEnabled: configured,
        status: configured
          ? this.configuredStatus(type)
          : IntegrationStatus.NOT_CONFIGURED,
        lastCheckedAt: new Date(),
        ...(configured &&
          type === IntegrationProviderType.WEBSITE && {
            lastSuccessAt: new Date(),
          }),
      },
      update: { lastCheckedAt: new Date() },
    });
    if (
      !configured &&
      (provider.status !== IntegrationStatus.NOT_CONFIGURED ||
        provider.isEnabled)
    )
      return this.prisma.integrationProvider.update({
        where: { id: provider.id },
        data: { isEnabled: false, status: IntegrationStatus.NOT_CONFIGURED },
      });
    return provider;
  }

  private configured(type: IntegrationProviderType) {
    if (type === IntegrationProviderType.WISE) return wiseConfigured();
    if (type === IntegrationProviderType.TELEPHONY)
      return telephonyConfigured();
    if (type === IntegrationProviderType.WEBSITE)
      return Boolean(process.env.WEBSITE_WEBHOOK_SECRET?.trim());
    return false;
  }

  private configuredStatus(type: IntegrationProviderType) {
    return type === IntegrationProviderType.WEBSITE
      ? IntegrationStatus.CONNECTED
      : IntegrationStatus.DEGRADED;
  }
}
