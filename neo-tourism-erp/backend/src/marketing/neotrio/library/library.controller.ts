import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Permissions } from '../../../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../auth/guards/permissions.guard';
import { LibraryQueryDto } from '../dto/neotrio.dto';
import { LibraryService } from './library.service';

@Controller('marketing/neotrio/library')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LibraryController {
  constructor(private readonly library: LibraryService) {}
  @Get() @Permissions('marketing.neotrio.library.view') list(
    @Query() query: LibraryQueryDto,
  ) {
    return this.library.list(query);
  }
  @Get(':id') @Permissions('marketing.neotrio.library.view') get(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.library.get(id);
  }
}
