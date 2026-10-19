import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Get,
  Post,
  Put,
  Body,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  ApiBody,
  ApiConsumes,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../../common/dto/api-docs.decorators';
import { I18nImportReportDto } from '../dto/i18n-responses.dto';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import {
  ALL_ADMIN_ROLES,
  AdminEndpoint,
} from '../../admin-auth/admin-auth.decorators';
import { I18nImportQueryDto } from '../dto/import-query.dto';
import { I18nImportService } from '../services/i18n-import.service';
import { I18nExportService } from '../services/i18n-export.service';
import { I18nTextsService } from '../services/i18n-texts.service';
import {
  I18nTextsDto,
  I18nTextsQueryDto,
  ResetI18nTextDto,
  TranslateI18nTextDto,
  TranslatedI18nTextDto,
  UpdateI18nTextDto,
  UpdateI18nTextManyDto,
} from '../dto/i18n-texts.dto';

/** Admin-only, so a single file this size is not a real DoS surface, but
 * there's no reason to accept more than a translation workbook plausibly
 * needs — 10 MB is generous headroom over translations_seed.xlsx. */
const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * docs/01_FOUNDATION_AUTH.md §9.3: "POST /admin/i18n/import ... GET
 * /admin/i18n/export". docs/06 §2.2: localizations follow the "localization" toggle (super admin always)
 * (AdminAuthGuard via @AdminEndpoint; imports are auto-audited).
 */
@ApiTags('admin-i18n')
@AdminEndpoint(...ALL_ADMIN_ROLES)
@Controller('admin/i18n')
export class I18nAdminController {
  constructor(
    private readonly importService: I18nImportService,
    private readonly exportService: I18nExportService,
    private readonly texts: I18nTextsService,
  ) {}

  /** Owner 2026-10-18: the texts under a key prefix in every language
   * (admin «Справочник»: `guide.`). */
  @Get('texts')
  @ApiEnvelopeResponse(I18nTextsDto)
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  async listTexts(@Query() query: I18nTextsQueryDto): Promise<I18nTextsDto> {
    return this.texts.list(query.prefix);
  }

  /** One text in one language; phones get it on their next bundle sync. */
  @Put('texts')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR, ErrorCode.I18N_LANGUAGE_NOT_FOUND],
    404: [ErrorCode.NOT_FOUND],
  })
  async updateText(@Body() dto: UpdateI18nTextDto): Promise<void> {
    await this.texts.update(dto.key, dto.lang, dto.value);
  }

  /** «Перевести на все языки»: a machine-translation preview of the
   * edited text into every other language (nothing is saved). */
  @Post('texts/translate')
  @HttpCode(HttpStatus.OK)
  @ApiEnvelopeResponse(TranslatedI18nTextDto)
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR, ErrorCode.TRANSLATION_UNAVAILABLE],
    503: [ErrorCode.TRANSLATION_UNAVAILABLE],
  })
  async translateText(
    @Body() dto: TranslateI18nTextDto,
  ): Promise<TranslatedI18nTextDto> {
    return this.texts.translatePreview(dto.text, dto.source);
  }

  /** The confirmed preview: one text in many languages at once. */
  @Put('texts/many')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR, ErrorCode.I18N_LANGUAGE_NOT_FOUND],
    404: [ErrorCode.NOT_FOUND],
  })
  async updateTextMany(@Body() dto: UpdateI18nTextManyDto): Promise<void> {
    const values = Object.fromEntries(
      Object.entries(dto.values)
        .filter(([, v]) => typeof v === 'string' && v.trim().length > 0)
        .map(([l, v]) => [l, v.trim()]),
    );
    await this.texts.saveMany(dto.key, values);
  }

  /** «Сбросить к встроенному тексту» (one language or all). */
  @Post('texts/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR], 404: [ErrorCode.NOT_FOUND] })
  async resetText(@Body() dto: ResetI18nTextDto): Promise<void> {
    await this.texts.reset(dto.key, dto.lang);
  }

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
