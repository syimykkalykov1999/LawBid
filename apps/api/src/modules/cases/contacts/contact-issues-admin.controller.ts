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
import { CaseContactsService } from './case-contacts.service';
import {
  ContactIssueIdParamDto,
  ContactIssueResolutionDto,
  ResolveContactIssueDto,
} from './dto/case-contacts.dto';

const E = ErrorCode;

/**
 * docs/04 §8.4: support/moderation decides a "Не могу связаться" report.
 * The queue screen itself is docs/06 (admin panel); this is the decision
 * API it will call, guarded by the interim AdminRolesGuard (docs/06 §2.2:
 * support and moderators handle user reports; super_admin everything).
 */
@ApiTags('admin-contact-issues')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@AdminRoles('support', 'moderator', 'super_admin')
@UseGuards(AdminRolesGuard)
@Controller('admin/contact-issues')
export class ContactIssuesAdminController {
  constructor(private readonly contacts: CaseContactsService) {}

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Confirm or reject a contact-issue report; the threshold suspends the client (docs/04 §8.4)',
  })
  @ApiEnvelopeResponse(ContactIssueResolutionDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FORBIDDEN],
    404: [E.NOT_FOUND],
    409: [E.CONTACT_ISSUE_INVALID_STATE],
  })
  resolveContactIssue(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: ContactIssueIdParamDto,
    @Body() dto: ResolveContactIssueDto,
  ): Promise<ContactIssueResolutionDto> {
    return this.contacts.resolve(admin, params.id, dto);
  }
}
