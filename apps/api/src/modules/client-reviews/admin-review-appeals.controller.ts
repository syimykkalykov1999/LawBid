import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  CurrentAdmin,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import {
  AdminReviewAppealDto,
  AdminReviewAppealsDecisionDto,
  AdminReviewAppealsDecisionResultDto,
  AdminReviewAppealsQueryDto,
} from './client-reviews.dto';
import { ClientReviewsService } from './client-reviews.service';

/** Owner 2026-09-30: appeals against client reviews — accept (remove)
 * or reject (keep), one by one or many at once. */
@ApiTags('admin-review-appeals')
@AdminEndpoint('super_admin', 'moderator')
@Controller('admin/review-appeals')
export class AdminReviewAppealsController {
  constructor(private readonly reviews: ClientReviewsService) {}

  @Get()
  @ApiOperation({ summary: 'Appeals by status, oldest first' })
  @ApiEnvelopeResponse(AdminReviewAppealDto, { isArray: true })
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  listReviewAppeals(@Query() q: AdminReviewAppealsQueryDto) {
    return this.reviews.listAppeals(q.status ?? 'pending', q.cursor);
  }

  @Post('decide')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept or reject appeals in bulk' })
  @ApiEnvelopeResponse(AdminReviewAppealsDecisionResultDto)
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  decideReviewAppeals(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: AdminReviewAppealsDecisionDto,
  ) {
    return this.reviews.decideAppeals(admin.id, dto);
  }
}
