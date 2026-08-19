import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DepartmentsModule } from './departments/departments.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PermissionsModule } from './permissions/permissions.module';
import { PrismaModule } from './prisma/prisma.module';
import { RolesModule } from './roles/roles.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    DepartmentsModule,
    RolesModule,
    PermissionsModule,
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}
