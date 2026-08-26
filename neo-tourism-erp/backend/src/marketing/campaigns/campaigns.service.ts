import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCampaignDto } from './dto/campaign.dto';

@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async create(dto: CreateCampaignDto, actorId: string) {
    if (
      dto.startDate &&
      dto.endDate &&
      new Date(dto.endDate) < new Date(dto.startDate)
    )
      throw new BadRequestException(
        'Campaign end date must be on or after its start date.',
      );
    return this.prisma.$transaction(async (tx) => {
      const year = new Date().getUTCFullYear();
      const counter = await tx.marketingCampaignCounter.upsert({
        where: { year },
        create: { year, nextNumber: 2 },
        update: { nextNumber: { increment: 1 } },
      });
      return tx.marketingCampaign.create({
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
    });
  }
}
