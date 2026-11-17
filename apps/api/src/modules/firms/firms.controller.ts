import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  AssistantAllowed,
  AttorneyOnly,
} from '../auth/assistant/assistant-context';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { FirmsService } from './firms.service';

const E = ErrorCode;

export class FirmMemberDto {
  @ApiProperty() attorneyId!: string;
  @ApiProperty({ nullable: true, type: String }) firstName!: string | null;
  @ApiProperty({ nullable: true, type: String }) lastName!: string | null;
  @ApiProperty({ enum: ['owner', 'member'] }) role!: string;
  @ApiProperty({ enum: ['invited', 'active'] }) status!: string;
  @ApiProperty({ type: [String] }) states!: string[];
}

export class FirmDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() ownerId!: string;
  @ApiProperty({ type: [String] }) states!: string[];
  @ApiProperty({ type: [FirmMemberDto] }) members!: FirmMemberDto[];
}

export class CreateFirmDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(120) name!: string;
}

export class InviteFirmMemberDto {
  @ApiProperty({ description: "The lawyer's @username" })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  username!: string;
}

export class TransferFirmOwnerDto {
  @ApiProperty({ description: 'An active lawyer of the firm' })
  @IsUUID()
  attorneyId!: string;
}

/** Owner 2026-10-14: a firm is its lawyers; behind the flag `firm_profiles`. */
@ApiTags('firms')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('firms')
export class FirmsController {
  constructor(private readonly firms: FirmsService) {}

  @AttorneyOnly()
  @Post()
  @ApiOperation({ summary: 'Create a firm; the creator is its owner' })
  @ApiEnvelopeResponse(FirmDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    409: [E.FIRM_ALREADY_MEMBER, E.FEATURE_DISABLED],
  })
  createFirm(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateFirmDto,
  ): Promise<FirmDto> {
    return this.firms.create(user.sub, dto.name);
  }

  @AssistantAllowed()
  @Get('me')
  @ApiOperation({ summary: 'My firm (or a pending invitation); 404 if none' })
  @ApiEnvelopeResponse(FirmDto)
  @ApiErrors({ 404: [E.NOT_FOUND], 409: [E.FEATURE_DISABLED] })
  myFirm(@CurrentUser() user: RequestUser): Promise<FirmDto> {
    return this.firms.mine(user.sub);
  }

  @AttorneyOnly()
  @Post('me/members')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Owner invites a lawyer to the firm' })
  @ApiEnvelopeResponse(FirmDto)
  @ApiErrors({
    403: [E.FORBIDDEN],
    409: [E.FIRM_ALREADY_MEMBER, E.FIRM_FULL, E.FEATURE_DISABLED],
  })
  inviteFirmMember(
    @CurrentUser() user: RequestUser,
    @Body() dto: InviteFirmMemberDto,
  ): Promise<FirmDto> {
    return this.firms.invite(user.sub, dto.username);
  }

  @AttorneyOnly()
  @Post('me/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept the invitation to a firm' })
  @ApiEnvelopeResponse(FirmDto)
  @ApiErrors({ 404: [E.NOT_FOUND], 409: [E.FEATURE_DISABLED] })
  acceptFirmInvite(@CurrentUser() user: RequestUser): Promise<FirmDto> {
    return this.firms.accept(user.sub);
  }

  @AttorneyOnly()
  @Delete('me/members/:attorneyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Leave, decline, or (owner) remove a member' })
  @ApiErrors({
    403: [E.FORBIDDEN],
    404: [E.NOT_FOUND],
    409: [E.FEATURE_DISABLED, E.FIRM_OWNER_MUST_TRANSFER],
  })
  removeFirmMember(
    @CurrentUser() user: RequestUser,
    @Param('attorneyId', ParseUUIDPipe) attorneyId: string,
  ): Promise<void> {
    return this.firms.remove(user.sub, attorneyId);
  }

  @AttorneyOnly()
  @Post('me/owner')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Owner makes an active lawyer the owner (stays a member)',
  })
  @ApiEnvelopeResponse(FirmDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FORBIDDEN],
    404: [E.NOT_FOUND],
    409: [E.FEATURE_DISABLED],
  })
  transferFirmOwner(
    @CurrentUser() user: RequestUser,
    @Body() dto: TransferFirmOwnerDto,
  ): Promise<FirmDto> {
    return this.firms.transferOwnership(user.sub, dto.attorneyId);
  }

  @AttorneyOnly()
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Owner closes the firm; its lawyers are told' })
  @ApiErrors({ 403: [E.FORBIDDEN], 409: [E.FEATURE_DISABLED] })
  closeFirm(@CurrentUser() user: RequestUser): Promise<void> {
    return this.firms.close(user.sub);
  }

  @AttorneyOnly()
  @Get('me/cases/:caseId/eligible')
  @ApiOperation({ summary: 'Members whose licence fits the case' })
  @ApiEnvelopeResponse(FirmMemberDto, { isArray: true })
  @ApiErrors({ 404: [E.NOT_FOUND], 409: [E.FEATURE_DISABLED] })
  firmMembersForCase(
    @CurrentUser() user: RequestUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
  ): Promise<FirmMemberDto[]> {
    return this.firms.eligibleForCase(user.sub, caseId);
  }

  @AssistantAllowed()
  @Get(':id')
  @ApiOperation({ summary: 'A firm page: active members and their states' })
  @ApiEnvelopeResponse(FirmDto)
  @ApiErrors({ 404: [E.NOT_FOUND], 409: [E.FEATURE_DISABLED] })
  getFirm(@Param('id', ParseUUIDPipe) id: string): Promise<FirmDto> {
    return this.firms.publicPage(id);
  }
}
