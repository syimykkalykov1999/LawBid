import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode as E } from '../../common/errors/error-code.enum';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { LegalAcceptanceService } from './legal-acceptance.service';
import {
  AcceptLegalDocumentsDto,
  LegalDocLocaleQueryDto,
  LegalDocTypeParamDto,
  LegalDocumentBriefDto,
  LegalDocumentPublicDto,
  PendingLegalDocumentDto,
} from './legal-documents.dto';
import { LegalDocumentsService } from './legal-documents.service';

/** Owner 2026-10-05 (legal documents): the current legal texts (public, for
 * lawbid.dev and the app) and the acceptance of the ones a user owes. */
@ApiTags('legal')
@Controller('legal')
export class LegalDocumentsController {
  constructor(
    private readonly docs: LegalDocumentsService,
    private readonly acceptance: LegalAcceptanceService,
  ) {}

  @Public()
  @Get('documents')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({
    summary:
      'Every current legal document (type, language, version, date; public, for the website and the app)',
  })
  @ApiEnvelopeResponse(LegalDocumentBriefDto, { isArray: true })
  listCurrentLegalDocuments(): Promise<LegalDocumentBriefDto[]> {
    return this.docs.listCurrent();
  }

  @Public()
  @Get('documents/:type')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({
    summary:
      'The current text of one legal document in Markdown (public); English when there is no text in the language',
  })
  @ApiEnvelopeResponse(LegalDocumentPublicDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  getCurrentLegalDocument(
    @Param() params: LegalDocTypeParamDto,
    @Query() q: LegalDocLocaleQueryDto,
  ): Promise<LegalDocumentPublicDto> {
    return this.docs.currentText(params.type, q.locale);
  }

  @Get('pending')
  @ApiBearerAuth()
  @ApiErrors(AUTHENTICATED_ERRORS)
  @ApiOperation({
    summary:
      'Legal documents of my role that I have not accepted at the current version',
  })
  @ApiEnvelopeResponse(PendingLegalDocumentDto, { isArray: true })
  getPendingLegalDocuments(
    @CurrentUser() user: RequestUser,
  ): Promise<PendingLegalDocumentDto[]> {
    return this.acceptance.pending(user.sub);
  }

  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiErrors(AUTHENTICATED_ERRORS)
  @ApiOperation({
    summary:
      'Accept the current versions the user ticked (an append-only consent with document, IP and device); returns what is still pending',
  })
  @ApiEnvelopeResponse(PendingLegalDocumentDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  acceptLegalDocuments(
    @CurrentUser() user: RequestUser,
    @Body() dto: AcceptLegalDocumentsDto,
    @Req() req: Request,
  ): Promise<PendingLegalDocumentDto[]> {
    return this.acceptance.accept(user.sub, dto.documentIds, {
      ip: req.ip ?? null,
      deviceId: dto.deviceId ?? req.header('x-device-id') ?? null,
    });
  }
}
