import {
  Injectable,
  NotFoundException,
  NotImplementedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { telephonyConfigured } from './telephony.config';

@Injectable()
export class TelephonyService {
  constructor(private readonly prisma: PrismaService) {}

  async makeCall(leadId: string, userId: string) {
    void userId;
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, customer: { select: { phone: true } } },
    });
    if (!lead) throw new NotFoundException('Lead not found.');
    if (!lead.customer.phone)
      throw new ServiceUnavailableException(
        'The customer does not have a phone number.',
      );
    if (!telephonyConfigured())
      throw new ServiceUnavailableException(
        'Telephony integration is not configured.',
      );
    throw new NotImplementedException(
      'PBX settings are present, but no verified provider adapter is installed.',
    );
  }

  callLogs() {
    return this.prisma.callLog.findMany({
      select: {
        id: true,
        leadId: true,
        customerId: true,
        userId: true,
        direction: true,
        phoneNumber: true,
        externalCallId: true,
        startedAt: true,
        answeredAt: true,
        endedAt: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}
