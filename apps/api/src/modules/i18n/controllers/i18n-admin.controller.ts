import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { AdminGuard } from '../guards/admin.guard';
import { I18nImportQueryDto } from '../dto/import-query.dto';
import { I18nImportService } from '../services/i18n-import.service';
import { I18nExportService } from '../services/i18n-export.service';

/** Admin-only, so a single file this size is not a real DoS surface, but
 * there's no reason to accept more than a translation workbook plausibly
 * needs — 10 MB is generous headroom over translations_seed.xlsx. */
const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

/**
 * docs/01_FOUNDATION_AUTH.md §9.3: "POST /admin/i18n/import ... GET
 * /admin/i18n/export". Gated by AdminGuard on top of the global
 * JwtAuthGuard (no @Public() here — this controller is admin-only, see
 * AdminGuard's doc comment for why that's a route-level guard rather
 * than a full RolesGuard at this stage).
 */
@Controller('admin/i18n')
@UseGuards(AdminGuard)
export class I18nAdminController {
  constructor(
    private readonly importService: I18nImportService,
    private readonly exportService: I18nExportService,
  ) {}

  @Post('import')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_FILE_BYTES } }),
  )
  async import(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query() query: I18nImportQueryDto,
  ) {
    if (!file || file.buffer.length === 0) {
      throw new BadRequestException({
        code: ErrorCode.I18N_IMPORT_INVALID,
        message:
          'A non-empty xlsx or csv file is required (multipart field "file").',
      });
    }
    const mode = query.mode ?? 'dry-run';
    return this.importService.run(file.buffer, mode);
  }

  @Get('export')
  async export(@Res() res: Response): Promise<void> {
    const buffer = await this.exportService.buildWorkbook();
    res
      .status(200)
      .set(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      .set(
        'Content-Disposition',
        'attachment; filename="translations_export.xlsx"',
      )
      .send(buffer);
  }
}
