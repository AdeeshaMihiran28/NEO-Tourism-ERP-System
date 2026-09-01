import { Module } from '@nestjs/common';
import { NotificationsModule } from '../../notifications/notifications.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { DealsModule } from '../deals/deals.module';
import { CharactersController } from './characters/characters.controller';
import { CharactersService } from './characters/characters.service';
import { IdeasController } from './ideas/ideas.controller';
import { IdeasService } from './ideas/ideas.service';
import { LibraryController } from './library/library.controller';
import { LibraryService } from './library/library.service';
import { NeoTrioController } from './neotrio.controller';
import { NeoTrioService } from './neotrio.service';
import { PerformanceController } from './performance/performance.controller';
import { PerformanceService } from './performance/performance.service';
import { ProductionController } from './production/production.controller';
import { ProductionService } from './production/production.service';
import { NeoTrioDeadlineScheduler } from './neotrio-deadline.scheduler';
@Module({
  imports: [DealsModule, PrismaModule, NotificationsModule],
  controllers: [
    NeoTrioController,
    CharactersController,
    IdeasController,
    ProductionController,
    LibraryController,
    PerformanceController,
  ],
  providers: [
    NeoTrioService,
    CharactersService,
    IdeasService,
    ProductionService,
    LibraryService,
    PerformanceService,
    NeoTrioDeadlineScheduler,
  ],
  exports: [NeoTrioService, IdeasService, ProductionService],
})
export class NeoTrioModule {}
