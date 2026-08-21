import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule],
  controllers: [LeadsController],
  providers: [LeadsService],
})
export class LeadsModule {}
