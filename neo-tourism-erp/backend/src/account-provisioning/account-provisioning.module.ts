import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PositionsModule } from '../positions/positions.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountProvisioningService } from './account-provisioning.service';
import { InvitationMailerService } from './invitation-mailer.service';

@Module({
  imports: [PrismaModule, AuditModule, PositionsModule],
  providers: [AccountProvisioningService, InvitationMailerService],
  exports: [AccountProvisioningService],
})
export class AccountProvisioningModule {}
