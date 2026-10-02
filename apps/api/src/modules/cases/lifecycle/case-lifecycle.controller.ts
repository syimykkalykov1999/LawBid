import { AttorneyOnly } from '../../auth/assistant/assistant-context';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { IdempotencyInterceptor } from '../../../idempotency/idempotency.interceptor';
import {
  CurrentUser,
  type RequestUser,
} from '../../auth/decorators/current-user.decorator';
import { CasesService } from '../cases.service';
import { CaseIdParamDto } from '../dto/case-requests.dto';
import { CaseDto } from '../dto/case-responses.dto';
import { CaseLifecycleService } from './case-lifecycle.service';
import { DisputeCaseDto } from './dto/case-lifecycle.dto';

const E = ErrorCode;
const LIFECYCLE_ERRORS = {
  400: [E.VALIDATION_ERROR],
  404: [E.CASE_NOT_FOUND],
  409: [E.CASE_INVALID_STATE],
} as const;

/** docs/04_CASES_BIDS.md §10.1, §15 (stage 4.6): completion and dispute. */
@ApiTags('cases')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller()
export class CaseLifecycleController {
  constructor(
    private readonly lifecycle: CaseLifecycleService,
    private readonly cases: CasesService,
  ) {}

  @Post('cases/:id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Client "Done": in_progress → pending_completion (docs/04 §10.1)',
  })
  @ApiEnvelopeResponse(CaseDto)
  @ApiErrors(LIFECYCLE_ERRORS)
  async completeCase(
    @CurrentUser() user: RequestUser,
    @Param() params: CaseIdParamDto,
  ): Promise<CaseDto> {
    return this.cases.toFullDto(await this.lifecycle.complete(user, params.id));
  }

  // Audit 2026-10-02: an assistant acts here only with "bids".
  @AttorneyOnly('bids')
  @Post('cases/:id/confirm-completion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Attorney confirms completion: → closed (docs/04 §10.1)',
  })
  @ApiEnvelopeResponse(CaseDto)
  @ApiErrors(LIFECYCLE_ERRORS)
  async confirmCaseCompletion(
    @CurrentUser() user: RequestUser,
    @Param() params: CaseIdParamDto,
  ): Promise<CaseDto> {
    return this.cases.toFullDto(
      await this.lifecycle.confirmCompletion(user, params.id),
    );
  }

  // Audit 2026-10-02: an assistant acts here only with "bids".
  @AttorneyOnly('bids')
  @Post('cases/:id/dispute')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOperation({
    summary: 'Attorney disputes completion: → disputed (docs/04 §10.1)',
  })
  @ApiEnvelopeResponse(CaseDto)
  @ApiErrors(LIFECYCLE_ERRORS)
  async disputeCase(
    @CurrentUser() user: RequestUser,
    @Param() params: CaseIdParamDto,
    @Body() dto: DisputeCaseDto,
  ): Promise<CaseDto> {
    return this.cases.toFullDto(
      await this.lifecycle.dispute(user, params.id, dto.reason),
    );
  }
}
