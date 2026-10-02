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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  ALL_ADMIN_ROLES,
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import {
  AdminBanDto,
  BanIdParamDto,
  BansQueryDto,
  BlockResultDto,
  BlockUserDto,
  CreateBanDto,
  LiftBanDto,
  SanctionUserIdParamDto,
} from './admin-sanctions.dto';
import { AdminSanctionsService } from './admin-sanctions.service';

const E = ErrorCode;

/** "Санкции": rights area `sanctions` (view = read the list, manage = block
 * and lift). The service writes its own audit rows. */
@ApiTags('admin-sanctions')
@AdminEndpoint(...ALL_ADMIN_ROLES)
@SkipAutoAudit()
@Controller('admin/sanctions')
export class AdminSanctionsController {
  constructor(private readonly sanctions: AdminSanctionsService) {}

  @Get('bans')
  @ApiOperation({ summary: 'Blocks and bans, newest first' })
  @ApiEnvelopeResponse(AdminBanDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  async listBans(@Query() q: BansQueryDto) {
    return this.sanctions.list(q);
  }

  @Post('bans')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ban a user, phone number, e-mail or device' })
  @ApiEnvelopeResponse(AdminBanDto, { status: HttpStatus.CREATED })
  @ApiErrors({ 404: [E.NOT_FOUND], 409: [E.VALIDATION_ERROR] })
  createBan(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: CreateBanDto,
  ): Promise<AdminBanDto> {
    return this.sanctions.create(admin, dto);
  }

  @Post('bans/:id/lift')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lift a block or ban' })
  @ApiEnvelopeResponse(AdminBanDto)
  @ApiErrors({ 404: [E.NOT_FOUND], 409: [E.VALIDATION_ERROR] })
  liftBan(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: BanIdParamDto,
    @Body() dto: LiftBanDto,
  ): Promise<AdminBanDto> {
    return this.sanctions.lift(admin, p.id, dto.reason);
  }

  @Post('users/:id/block')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Block a user (days or for good), optionally their phone, e-mail and devices; sessions end at once',
  })
  @ApiEnvelopeResponse(BlockResultDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  blockUser(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: SanctionUserIdParamDto,
    @Body() dto: BlockUserDto,
  ): Promise<BlockResultDto> {
    return this.sanctions.blockUser(admin, p.id, dto);
  }
}
