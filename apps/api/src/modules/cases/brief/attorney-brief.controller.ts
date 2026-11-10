import { Controller, Get, Param, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import {
  CurrentUser,
  type RequestUser,
} from '../../auth/decorators/current-user.decorator';
import { CaseIdParamDto } from '../dto/case-requests.dto';
import { AttorneyBriefService } from './attorney-brief.service';

/** Sweep A-c1 (owner A-044): the attorney's case brief PDF. */
@ApiTags('cases')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller()
export class AttorneyBriefController {
  constructor(private readonly briefs: AttorneyBriefService) {}

  @Get('cases/:id/attorney-brief.pdf')
  @ApiOperation({
    summary:
      'Accepted attorney only: PDF with the client contacts, the accepted terms and up to 9 case photos',
  })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, description: 'PDF file.' })
  @ApiErrors({ 404: [ErrorCode.CASE_NOT_FOUND] })
  async getAttorneyBrief(
    @CurrentUser() user: RequestUser,
    @Param() p: CaseIdParamDto,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.briefs.pdfFor(user, p.id);
    res
      .type('application/pdf')
      .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      .setHeader('Cache-Control', 'private, no-store')
      .send(buffer);
  }
}
