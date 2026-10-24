import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import type { SyncPage } from '../../common/sync/sync.util';
import { IdempotencyInterceptor } from '../../idempotency/idempotency.interceptor';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import {
  FileDto,
  FileViewDto,
  FileViewsQueryDto,
  PresignFileDto,
  PresignedFileDto,
} from './dto/files.dto';
import { FileAccessService } from './file-access.service';
import { FilesService } from './files.service';

const E = ErrorCode;

/**
 * docs/03_VERIFICATION_PROFILES.md §2.2, stage 3.2: pre-signed uploads to
 * private S3. Every route needs a signed-in caller (global JwtAuthGuard);
 * a file is only ever visible to its owner here.
 */
@ApiTags('files')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('files')
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly access: FileAccessService,
  ) {}

  @Post('presign')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'A retry with the same key and body returns the same upload link.',
  })
  @ApiEnvelopeResponse(PresignedFileDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [
      E.VALIDATION_ERROR,
      E.FILE_TYPE_NOT_ALLOWED,
      E.FILE_TOO_LARGE,
      E.STORAGE_QUOTA_EXCEEDED,
    ],
    409: [E.IDEMPOTENCY_KEY_CONFLICT],
    429: [E.RATE_LIMITED, E.DAILY_UPLOAD_LIMIT_EXCEEDED],
    503: [E.PROVIDER_BUDGET_EXCEEDED, E.FILE_STORAGE_UNAVAILABLE],
  })
  async presign(
    @CurrentUser() user: RequestUser,
    @Body() dto: PresignFileDto,
  ): Promise<PresignedFileDto> {
    return this.files.presign(user.sub, dto);
  }

  /** Safe to retry: confirming an already confirmed file returns it. */
  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiEnvelopeResponse(FileDto)
  @ApiErrors({
    400: [
      E.VALIDATION_ERROR,
      E.FILE_TYPE_NOT_ALLOWED,
      E.FILE_TOO_LARGE,
      E.FILE_CHECKSUM_MISMATCH,
    ],
    404: [E.NOT_FOUND],
    409: [E.FILE_NOT_UPLOADED],
    503: [E.FILE_STORAGE_UNAVAILABLE],
  })
  async confirm(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FileDto> {
    return this.files.confirm(user.sub, id);
  }

  /** Poll after confirm until scanStatus leaves `pending`. */
  @Get(':id')
  @ApiEnvelopeResponse(FileDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  async get(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FileDto> {
    return this.files.get(user.sub, id);
  }

  /**
   * Security & legal pass 2026-10-24: who other than you was given a link
   * to this file, from which device (newest first, 20 per page). Only the
   * file's owner may read it. Owner 2026-10-24: `?since=` returns only the
   * rows logged after that time and meta.syncedAt, `?cursor=` pages back.
   */
  @Get(':id/views')
  @ApiEnvelopeResponse(FileViewDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  async views(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: FileViewsQueryDto,
  ): Promise<SyncPage<FileViewDto>> {
    return this.access.viewsOf(user.sub, id, {
      cursor: q.cursor,
      limit: q.limit,
      since: q.since,
      avatarOf: (fid) => this.files.mediaUrl(fid),
    });
  }
}
