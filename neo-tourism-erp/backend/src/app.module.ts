import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { CustomersModule } from './customers/customers.module';
import { DepartmentsModule } from './departments/departments.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { LeadsModule } from './leads/leads.module';
import { PermissionsModule } from './permissions/permissions.module';
import { PrismaModule } from './prisma/prisma.module';
import { RolesModule } from './roles/roles.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    DepartmentsModule,
    RolesModule,
    PermissionsModule,
    CustomersModule,
    LeadsModule,
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}
