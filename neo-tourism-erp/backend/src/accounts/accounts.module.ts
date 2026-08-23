import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountsController } from './accounts.controller';
import { BookingFinanceService } from './services/booking-finance.service';
import { BookingsModule } from '../bookings/bookings.module';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule, BookingsModule],
  controllers: [AccountsController],
  providers: [BookingFinanceService],
  exports: [BookingFinanceService],
})
export class AccountsModule {}
