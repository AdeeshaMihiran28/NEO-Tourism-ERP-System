import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../../audit/audit.service';
import type { AuthenticatedUser } from '../../../auth/auth.types';
import type { RequestMetadata } from '../../../common/request-metadata';
import { PrismaService } from '../../../prisma/prisma.service';
import type { ManualAttributionDto } from '../dto/signal.dto';

@Injectable()
export class AttributionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  async manual(
    dto: ManualAttributionDto,
    user: AuthenticatedUser,
    requestMetadata?: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const [lead, campaign, active] = await Promise.all([
        tx.lead.findUnique({
          where: { id: dto.leadId },
          select: {
            id: true,
            customerId: true,
            saleSubmission: {
              select: { id: true, booking: { select: { id: true } } },
            },
          },
        }),
        tx.marketingCampaign.findUnique({
          where: { id: dto.campaignId },
          select: { id: true, dealId: true },
        }),
        tx.marketingAttribution.findMany({
          where: { leadId: dto.leadId, isActive: true },
          select: {
            id: true,
            campaignId: true,
            dealId: true,
            contentId: true,
            confidence: true,
            source: true,
          },
        }),
      ]);
      if (!lead) throw new NotFoundException('Lead not found.');
      if (!campaign)
        throw new NotFoundException('Marketing campaign not found.');
      const protectedAttribution = active.some(
        (x) => x.confidence === 'DIRECT' || x.confidence === 'TRACKED',
      );
      if (
        protectedAttribution &&
        !user.permissions.includes('marketing.attribution.override')
      )
        throw new ConflictException(
          'This Lead has tracked attribution. Override permission and a documented reason are required.',
        );
      const now = new Date();
      if (active.length)
        await tx.marketingAttribution.updateMany({
          where: { id: { in: active.map((x) => x.id) } },
          data: { isActive: false, supersededAt: now },
        });
      const created = await tx.marketingAttribution.create({
        data: {
          leadId: lead.id,
          customerId: lead.customerId,
          campaignId: campaign.id,
          dealId: campaign.dealId,
          saleSubmissionId: lead.saleSubmission?.id,
          bookingId: lead.saleSubmission?.booking?.id,
          confidence: 'MANUAL',
          source: 'MANUAL',
          reason: dto.reason.trim(),
          createdByUserId: user.id,
          convertedAt: lead.saleSubmission?.booking ? now : undefined,
        },
      });
      await this.audit.log(
        {
          actorUserId: user.id,
          entityType: 'MarketingAttribution',
          entityId: created.id,
          action: active.length
            ? 'MARKETING_ATTRIBUTION_CHANGED'
            : 'MARKETING_ATTRIBUTION_MANUAL_LINKED',
          oldValues: { activeAttributions: active },
          newValues: {
            campaignId: created.campaignId,
            dealId: created.dealId,
            confidence: created.confidence,
            reason: created.reason,
          },
          requestMetadata,
        },
        tx,
      );
      return created;
    });
  }
  listForLead(leadId: string) {
    return this.prisma.marketingAttribution.findMany({
      where: { leadId },
      include: {
        campaign: { select: { id: true, campaignCode: true, name: true } },
        deal: { select: { id: true, dealCode: true, title: true } },
        content: { select: { id: true, contentCode: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
