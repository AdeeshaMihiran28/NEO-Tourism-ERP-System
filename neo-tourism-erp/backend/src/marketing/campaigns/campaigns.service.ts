import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import type { RequestMetadata } from '../../common/request-metadata';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCampaignDto } from './dto/campaign.dto';

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.marketingCampaign.findMany({
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
        deal: { select: { id: true, dealCode: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async findOne(id: string) {
    const campaign = await this.prisma.marketingCampaign.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
        deal: { select: { id: true, dealCode: true, title: true } },
        content: {
          select: {
            id: true,
            contentCode: true,
            title: true,
            stage: true,
            deadline: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!campaign) throw new NotFoundException('Marketing campaign not found.');
    return campaign;
  }

  async create(
    dto: CreateCampaignDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    if (
      dto.startDate &&
      dto.endDate &&
      new Date(dto.endDate) < new Date(dto.startDate)
    )
      throw new BadRequestException(
        'Campaign end date must be on or after its start date.',
      );
    const [owner, deal] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: dto.ownerUserId, isActive: true },
        select: { id: true },
      }),
      dto.dealId
        ? this.prisma.marketingDeal.findUnique({
            where: { id: dto.dealId },
            select: { id: true },
          })
        : null,
    ]);
    if (!owner) throw new NotFoundException('Active campaign owner not found.');
    if (dto.dealId && !deal)
      throw new NotFoundException('Marketing deal not found.');
    return this.prisma.$transaction(async (tx) => {
      const year = new Date().getUTCFullYear();
      const counter = await tx.marketingCampaignCounter.upsert({
        where: { year },
        create: { year, nextNumber: 2 },
        update: { nextNumber: { increment: 1 } },
      });
      const campaign = await tx.marketingCampaign.create({
        data: {
          campaignCode: `CMP-${year}-${String(counter.nextNumber - 1).padStart(6, '0')}`,
          name: dto.name,
          description: dto.description,
          objective: dto.objective,
          status: dto.status,
          ...(dto.startDate && { startDate: new Date(dto.startDate) }),
          ...(dto.endDate && { endDate: new Date(dto.endDate) }),
          ownerUserId: dto.ownerUserId,
          dealId: dto.dealId,
          createdById: actorId,
          updatedById: actorId,
        },
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'MarketingCampaign',
          entityId: campaign.id,
          action: 'MARKETING_CAMPAIGN_CREATED',
          newValues: {
            campaignCode: campaign.campaignCode,
            name: campaign.name,
            status: campaign.status,
            dealId: campaign.dealId,
          },
          requestMetadata: meta,
        },
        tx,
      );
      return campaign;
    });
  }
}
