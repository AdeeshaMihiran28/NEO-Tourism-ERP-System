import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingLifecycleService } from './services/booking-lifecycle.service';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule],
  controllers: [BookingsController],
  providers: [BookingsService, BookingLifecycleService],
  exports: [BookingsService, BookingLifecycleService],
})
export class BookingsModule {}
