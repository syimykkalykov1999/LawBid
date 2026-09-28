import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { IdempotencyInterceptor } from '../../idempotency/idempotency.interceptor';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { FileDto, PresignFileDto, PresignedFileDto } from './dto/files.dto';
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
  constructor(private readonly files: FilesService) {}

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
    400: [E.VALIDATION_ERROR, E.FILE_TYPE_NOT_ALLOWED, E.FILE_TOO_LARGE],
    409: [E.IDEMPOTENCY_KEY_CONFLICT],
    429: [E.RATE_LIMITED],
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
}
