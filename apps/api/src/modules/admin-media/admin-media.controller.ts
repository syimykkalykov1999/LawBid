import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { IdempotencyInterceptor } from '../../idempotency/idempotency.interceptor';
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { FileDto, PresignedFileDto } from '../files/dto/files.dto';
import {
  AddOfficialStickerDto,
  AdminFileIdParamDto,
  AdminMediaIdParamDto,
  AdminMediaReasonDto,
  AdminStickerPackDto,
  AdminStickerPackRowDto,
  AdminStickerPacksQueryDto,
  AdminStickerParamDto,
  AdminStickerUploadDto,
  AdminVideoRowDto,
  AdminVideoStatsDto,
  AdminVideosQueryDto,
  CreateOfficialStickerPackDto,
} from './admin-media.dto';
import { AdminStickersService } from './admin-stickers.service';
import { AdminVideosService } from './admin-videos.service';

const E = ErrorCode;
type Page<T> = { items: T[]; nextCursor: string | null };

/** Audit 2026-10-02 — admin panel → Media (reels and stickers):
 * super_admin and moderators. Mutations write their own audit rows. */
@ApiTags('admin-media')
@AdminEndpoint('super_admin', 'moderator')
@SkipAutoAudit()
@Controller('admin/media')
export class AdminMediaController {
  constructor(
    private readonly videos: AdminVideosService,
    private readonly stickers: AdminStickersService,
  ) {}

  // --- reels -----------------------------------------------------------------------

  @Get('videos')
  @ApiOperation({ summary: 'Video assets (reels), newest first' })
  @ApiEnvelopeResponse(AdminVideoRowDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listAdminVideos(
    @Query() q: AdminVideosQueryDto,
  ): Promise<Page<AdminVideoRowDto>> {
    return this.videos.list(q.status, q.ownerId, q.cursor);
  }

  @Get('videos/stats')
  @ApiOperation({ summary: 'Counts by status, storage, uploads in 7 days' })
  @ApiEnvelopeResponse(AdminVideoStatsDto)
  getAdminVideoStats(): Promise<AdminVideoStatsDto> {
    return this.videos.stats();
  }

  @Post('videos/:id/takedown')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Take a video down: its post is removed (author told why), the asset deleted',
  })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.CONTENT_INVALID_STATE],
  })
  takedownAdminVideo(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminMediaIdParamDto,
    @Body() dto: AdminMediaReasonDto,
  ): Promise<void> {
    return this.videos.takedown(admin, p.id, dto.reason);
  }

  // --- stickers --------------------------------------------------------------------

  @Get('sticker-packs')
  @ApiOperation({ summary: 'Sticker packs (official and users), newest first' })
  @ApiEnvelopeResponse(AdminStickerPackRowDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listAdminStickerPacks(
    @Query() q: AdminStickerPacksQueryDto,
  ): Promise<Page<AdminStickerPackRowDto>> {
    return this.stickers.list(q);
  }

  @Post('sticker-packs')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOperation({ summary: 'Create an official pack (shown in Featured)' })
  @ApiEnvelopeResponse(AdminStickerPackDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    409: [E.STICKER_PACK_NAME_TAKEN, E.IDEMPOTENCY_KEY_CONFLICT],
  })
  createAdminStickerPack(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: CreateOfficialStickerPackDto,
  ): Promise<AdminStickerPackDto> {
    return this.stickers.createOfficial(admin, dto);
  }

  @Get('sticker-packs/:id')
  @ApiOperation({ summary: 'A pack with its stickers and image links' })
  @ApiEnvelopeResponse(AdminStickerPackDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  getAdminStickerPack(
    @Param() p: AdminMediaIdParamDto,
  ): Promise<AdminStickerPackDto> {
    return this.stickers.get(p.id);
  }

  @Post('sticker-packs/:id/hide')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Hide a pack (no installs or sends; the author is told why)',
  })
  @ApiEnvelopeResponse(AdminStickerPackDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.CONTENT_INVALID_STATE],
  })
  hideAdminStickerPack(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminMediaIdParamDto,
    @Body() dto: AdminMediaReasonDto,
  ): Promise<AdminStickerPackDto> {
    return this.stickers.setHidden(admin, p.id, true, dto.reason);
  }

  @Post('sticker-packs/:id/unhide')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Make a hidden pack available again' })
  @ApiEnvelopeResponse(AdminStickerPackDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.CONTENT_INVALID_STATE],
  })
  unhideAdminStickerPack(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminMediaIdParamDto,
    @Body() dto: AdminMediaReasonDto,
  ): Promise<AdminStickerPackDto> {
    return this.stickers.setHidden(admin, p.id, false, dto.reason);
  }

  @Post('sticker-packs/:id/stickers')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOperation({
    summary: 'Add an uploaded (clean) image to an official pack',
  })
  @ApiEnvelopeResponse(AdminStickerPackDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [
      E.CONTENT_INVALID_STATE,
      E.STICKER_LIMIT_REACHED,
      E.FILE_NOT_ATTACHABLE,
      E.IDEMPOTENCY_KEY_CONFLICT,
    ],
  })
  addAdminSticker(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminMediaIdParamDto,
    @Body() dto: AddOfficialStickerDto,
  ): Promise<AdminStickerPackDto> {
    return this.stickers.addSticker(admin, p.id, dto.fileId, dto.emoji);
  }

  @Delete('sticker-packs/:id/stickers/:stickerId')
  @ApiOperation({ summary: 'Remove a sticker from an official pack (soft)' })
  @ApiEnvelopeResponse(AdminStickerPackDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.CONTENT_INVALID_STATE],
  })
  removeAdminSticker(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminStickerParamDto,
  ): Promise<AdminStickerPackDto> {
    return this.stickers.removeSticker(admin, p.id, p.stickerId);
  }

  @Post('sticker-uploads')
  @ApiOperation({
    summary:
      'Step 1 of a sticker image upload: presigned POST (then POST the file to S3)',
  })
  @ApiEnvelopeResponse(PresignedFileDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR, E.FILE_TYPE_NOT_ALLOWED],
    413: [E.FILE_TOO_LARGE],
    429: [E.RATE_LIMITED],
    503: [E.FILE_STORAGE_UNAVAILABLE],
  })
  presignAdminStickerUpload(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: AdminStickerUploadDto,
  ): Promise<PresignedFileDto> {
    return this.stickers.presignUpload(admin, dto);
  }

  @Post('sticker-uploads/:fileId/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Step 2: verify the uploaded image; it is attachable once scanStatus = clean',
  })
  @ApiEnvelopeResponse(FileDto)
  @ApiErrors({
    400: [
      E.VALIDATION_ERROR,
      E.FILE_TYPE_NOT_ALLOWED,
      E.FILE_CHECKSUM_MISMATCH,
    ],
    404: [E.NOT_FOUND],
    409: [E.FILE_NOT_UPLOADED],
    413: [E.FILE_TOO_LARGE],
  })
  confirmAdminStickerUpload(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminFileIdParamDto,
  ): Promise<FileDto> {
    return this.stickers.confirmUpload(admin, p.fileId);
  }
}
