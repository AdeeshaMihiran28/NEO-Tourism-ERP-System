import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { META_MARKETING_PROVIDER } from './meta-adapter.interface';
import { MetaController } from './meta.controller';
import { EnvironmentMetaProvider } from './meta.provider';
import { MetaService } from './meta.service';

@Module({
  imports: [PrismaModule],
  controllers: [MetaController],
  providers: [
    MetaService,
    EnvironmentMetaProvider,
    { provide: META_MARKETING_PROVIDER, useExisting: EnvironmentMetaProvider },
  ],
  exports: [MetaService],
})
export class MetaModule {}
