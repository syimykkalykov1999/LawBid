import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { AdminRoles } from '../../admin-access/admin-roles.decorator';
import { AdminRolesGuard } from '../../admin-access/admin-roles.guard';
import {
  CurrentAdmin,
  type AdminActor,
} from '../../admin-access/current-admin.decorator';
import { CasesService } from '../cases.service';
import { CaseDto } from '../dto/case-responses.dto';
import { CaseLifecycleService } from './case-lifecycle.service';
import {
  CaseDisputeIdParamDto,
  ResolveCaseDisputeDto,
} from './dto/case-lifecycle.dto';

const E = ErrorCode;

/**
 * docs/04 §10.1 / stage 4.6: "решение админом реализуется API-заглушкой с
 * ролью, полноценный экран в файле 6". Support/moderators and super_admin
 * (docs/06 §2.2) close the case or send it back to work.
 */
@ApiTags('admin-case-disputes')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@AdminRoles('support', 'moderator', 'super_admin')
@UseGuards(AdminRolesGuard)
@Controller('admin/case-disputes')
export class CaseDisputesAdminController {
  constructor(
    private readonly lifecycle: CaseLifecycleService,
    private readonly cases: CasesService,
  ) {}

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Resolve a case dispute: closed or back to in_progress (docs/04 §10.1)',
  })
  @ApiEnvelopeResponse(CaseDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FORBIDDEN],
    404: [E.NOT_FOUND],
    409: [E.CASE_INVALID_STATE],
  })
  async resolveCaseDispute(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: CaseDisputeIdParamDto,
    @Body() dto: ResolveCaseDisputeDto,
  ): Promise<CaseDto> {
    return this.cases.toFullDto(
      await this.lifecycle.resolveDispute(
        admin,
        params.id,
        dto.decision,
        dto.note,
      ),
    );
  }
}
