import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
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
import { FileDto } from '../files/dto/files.dto';
import {
  CopyTemplateDto,
  DocumentTemplateDto,
  TemplateDownloadDto,
  TemplateIdParamDto,
  TemplatesQueryDto,
} from './document-templates.dto';
import { DocumentTemplatesService } from './document-templates.service';

const E = ErrorCode;
type Page<T> = { items: T[]; nextCursor: string | null };

/** Owner 2026-10-05 — the document templates library in the app. */
@ApiTags('document-templates')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('document-templates')
export class DocumentTemplatesController {
  constructor(private readonly templates: DocumentTemplatesService) {}

  @Get()
  @ApiOperation({
    summary:
      'Published templates: search, practice area, state (every-state ones included), language',
  })
  @ApiEnvelopeResponse(DocumentTemplateDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FEATURE_DISABLED] })
  listDocumentTemplates(
    @CurrentUser() user: RequestUser,
    @Query() q: TemplatesQueryDto,
  ): Promise<Page<DocumentTemplateDto>> {
    return this.templates.list(user, q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One published template' })
  @ApiEnvelopeResponse(DocumentTemplateDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FEATURE_DISABLED],
    404: [E.NOT_FOUND],
  })
  getDocumentTemplate(
    @CurrentUser() user: RequestUser,
    @Param() p: TemplateIdParamDto,
  ): Promise<DocumentTemplateDto> {
    return this.templates.get(user, p.id);
  }

  @Post(':id/download')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'A short signed download link (counted once per user a day)',
  })
  @ApiEnvelopeResponse(TemplateDownloadDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FEATURE_DISABLED, E.ENTITLEMENT_REQUIRED],
    404: [E.NOT_FOUND],
  })
  downloadDocumentTemplate(
    @CurrentUser() user: RequestUser,
    @Param() p: TemplateIdParamDto,
  ): Promise<TemplateDownloadDto> {
    return this.templates.download(user, p.id);
  }

  @Post(':id/copy')
  @ApiOperation({
    summary:
      'My own copy as a chat or case attachment (then send / attach it as usual)',
  })
  @ApiEnvelopeResponse(FileDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR, E.FILE_TYPE_NOT_ALLOWED, E.FILE_TOO_LARGE],
    403: [E.FEATURE_DISABLED, E.ENTITLEMENT_REQUIRED],
    404: [E.NOT_FOUND],
    429: [E.RATE_LIMITED],
    503: [E.FILE_STORAGE_UNAVAILABLE],
  })
  copyDocumentTemplate(
    @CurrentUser() user: RequestUser,
    @Param() p: TemplateIdParamDto,
    @Body() dto: CopyTemplateDto,
  ): Promise<FileDto> {
    return this.templates.copy(user, p.id, dto.target);
  }
}
