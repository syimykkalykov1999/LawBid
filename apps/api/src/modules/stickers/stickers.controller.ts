import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import {
  AddStickerDto,
  CreateStickerPackDto,
  ReorderStickerPacksDto,
  StickerDto,
  StickerIdParamDto,
  StickerLibraryDto,
  StickerPackDto,
  StickerPackRefParamDto,
  UpdateStickerPackDto,
} from './stickers.dto';
import { StickersService } from './stickers.service';

const E = ErrorCode;

/** Owner 2026-10-01 — Telegram-style stickers. */
@ApiTags('stickers')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('stickers')
export class StickersController {
  constructor(private readonly stickers: StickersService) {}

  @Get()
  @ApiOperation({
    summary: 'My sticker picker: recently used + installed packs',
  })
  @ApiEnvelopeResponse(StickerLibraryDto)
  getStickerLibrary(
    @CurrentUser() user: RequestUser,
  ): Promise<StickerLibraryDto> {
    return this.stickers.library(user.sub);
  }

  @Get('featured')
  @ApiOperation({ summary: 'Official packs, most installed first' })
  @ApiEnvelopeResponse(StickerPackDto, { isArray: true })
  listFeaturedStickerPacks(
    @CurrentUser() user: RequestUser,
  ): Promise<StickerPackDto[]> {
    return this.stickers.featured(user.sub);
  }

  @Put('order')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Order of my packs in the picker' })
  reorderStickerPacks(
    @CurrentUser() user: RequestUser,
    @Body() dto: ReorderStickerPacksDto,
  ): Promise<void> {
    return this.stickers.reorder(user.sub, dto.packIds);
  }

  @Post('packs')
  @ApiOperation({ summary: 'Create my sticker pack (installed at once)' })
  @ApiEnvelopeResponse(StickerPackDto, { status: 201 })
  @ApiErrors({ 409: [E.STICKER_LIMIT_REACHED], 429: [E.RATE_LIMITED] })
  createStickerPack(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateStickerPackDto,
  ): Promise<StickerPackDto> {
    return this.stickers.create(user.sub, dto.title);
  }

  @Get('packs/:ref')
  @ApiOperation({ summary: 'A pack by id or short name' })
  @ApiEnvelopeResponse(StickerPackDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  getStickerPack(
    @CurrentUser() user: RequestUser,
    @Param() p: StickerPackRefParamDto,
  ): Promise<StickerPackDto> {
    return this.stickers.get(user.sub, p.ref);
  }

  @Patch('packs/:ref')
  @ApiOperation({ summary: 'Rename my pack' })
  @ApiEnvelopeResponse(StickerPackDto)
  @ApiErrors({ 403: [E.FORBIDDEN], 404: [E.NOT_FOUND] })
  renameStickerPack(
    @CurrentUser() user: RequestUser,
    @Param() p: StickerPackRefParamDto,
    @Body() dto: UpdateStickerPackDto,
  ): Promise<StickerPackDto> {
    return this.stickers.rename(user.sub, p.ref, dto.title);
  }

  @Delete('packs/:ref')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete my pack' })
  @ApiErrors({ 403: [E.FORBIDDEN], 404: [E.NOT_FOUND] })
  deleteStickerPack(
    @CurrentUser() user: RequestUser,
    @Param() p: StickerPackRefParamDto,
  ): Promise<void> {
    return this.stickers.remove(user.sub, p.ref);
  }

  @Post('packs/:ref/stickers')
  @ApiOperation({ summary: 'Add my image to my pack' })
  @ApiEnvelopeResponse(StickerDto, { status: 201 })
  @ApiErrors({
    403: [E.FORBIDDEN],
    404: [E.NOT_FOUND],
    409: [E.STICKER_LIMIT_REACHED, E.FILE_NOT_ATTACHABLE],
    429: [E.RATE_LIMITED],
  })
  addSticker(
    @CurrentUser() user: RequestUser,
    @Param() p: StickerPackRefParamDto,
    @Body() dto: AddStickerDto,
  ): Promise<StickerDto> {
    return this.stickers.add(user.sub, p.ref, dto.fileId, dto.emoji);
  }

  @Post('packs/:ref/install')
  @ApiOperation({ summary: 'Add a pack to my stickers' })
  @ApiEnvelopeResponse(StickerPackDto)
  @ApiErrors({ 404: [E.NOT_FOUND], 409: [E.STICKER_LIMIT_REACHED] })
  installStickerPack(
    @CurrentUser() user: RequestUser,
    @Param() p: StickerPackRefParamDto,
  ): Promise<StickerPackDto> {
    return this.stickers.install(user.sub, p.ref);
  }

  @Delete('packs/:ref/install')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a pack from my stickers' })
  @ApiErrors({ 404: [E.NOT_FOUND] })
  uninstallStickerPack(
    @CurrentUser() user: RequestUser,
    @Param() p: StickerPackRefParamDto,
  ): Promise<void> {
    return this.stickers.uninstall(user.sub, p.ref);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a sticker from my pack' })
  @ApiErrors({ 404: [E.NOT_FOUND] })
  deleteSticker(
    @CurrentUser() user: RequestUser,
    @Param() p: StickerIdParamDto,
  ): Promise<void> {
    return this.stickers.removeSticker(user.sub, p.id);
  }
}
