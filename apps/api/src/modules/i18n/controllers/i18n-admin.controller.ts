import {
  BadRequestException,
  Controller,
  HttpStatus,
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
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../../common/dto/api-docs.decorators';
import { I18nImportReportDto } from '../dto/i18n-responses.dto';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { AdminGuard } from '../guards/admin.guard';
import { I18nImportQueryDto } from '../dto/import-query.dto';
import { I18nImportService } from '../services/i18n-import.service';
import { I18nExportService } from '../services/i18n-export.service';

/** Admin-only, so a single file this size is not a real DoS surface, but
 * there's no reason to accept more than a translation workbook plausibly
 * needs — 10 MB is generous headroom over translations_seed.xlsx. */
const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * docs/01_FOUNDATION_AUTH.md §9.3: "POST /admin/i18n/import ... GET
 * /admin/i18n/export". Gated by AdminGuard on top of the global
 * JwtAuthGuard (no @Public() here — this controller is admin-only, see
 * AdminGuard's doc comment for why that's a route-level guard rather
 * than a full RolesGuard at this stage).
 */
@ApiTags('admin-i18n')
@ApiBearerAuth()
@ApiErrors({
  ...AUTHENTICATED_ERRORS,
  403: [ErrorCode.FORBIDDEN],
})
@Controller('admin/i18n')
@UseGuards(AdminGuard)
export class I18nAdminController {
  constructor(
    private readonly importService: I18nImportService,
    private readonly exportService: I18nExportService,
  ) {}

  @Post('import')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'xlsx or csv in the docs/01 §9.2 format, ≤ 10 MB.',
        },
      },
    },
  })
  @ApiEnvelopeResponse(I18nImportReportDto, {
    status: HttpStatus.CREATED,
    description:
      'Success envelope (docs/01 §7): the import report; `dry-run` (default) never writes.',
  })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR, ErrorCode.I18N_IMPORT_INVALID],
    413: [ErrorCode.VALIDATION_ERROR],
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_FILE_BYTES } }),
  )
  async importTranslations(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query() query: I18nImportQueryDto,
  ): Promise<I18nImportReportDto> {
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
  @ApiProduces(XLSX_MIME)
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'translations_export.xlsx (docs/01 §9.2 layout) as an attachment — a binary file, not the JSON envelope.',
    content: { [XLSX_MIME]: { schema: { type: 'string', format: 'binary' } } },
  })
  async exportTranslations(@Res() res: Response): Promise<void> {
    const buffer = await this.exportService.buildWorkbook();
    res
      .status(200)
      .set('Content-Type', XLSX_MIME)
      .set(
        'Content-Disposition',
        'attachment; filename="translations_export.xlsx"',
      )
      .send(buffer);
  }
}
