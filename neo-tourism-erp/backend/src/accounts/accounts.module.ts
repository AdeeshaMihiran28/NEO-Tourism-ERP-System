import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountsController } from './accounts.controller';
import { BankingController } from './banking.controller';
import { GeneralLedgerController } from './general-ledger.controller';
import { AccountingControlsController } from './accounting-controls.controller';
import { AccountingControlsService } from './services/accounting-controls.service';
import { BookingFinanceService } from './services/booking-finance.service';
import { BankingService } from './services/banking.service';
import { GeneralLedgerService } from './services/general-ledger.service';
import { BookingsModule } from '../bookings/bookings.module';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule, BookingsModule],
  controllers: [
    AccountsController,
    BankingController,
    GeneralLedgerController,
    AccountingControlsController,
  ],
  providers: [
    AccountingControlsService,
    BookingFinanceService,
    BankingService,
    GeneralLedgerService,
  ],
  exports: [
    AccountingControlsService,
    BookingFinanceService,
    BankingService,
    GeneralLedgerService,
  ],
})
export class AccountsModule {}
