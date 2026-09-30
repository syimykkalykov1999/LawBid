import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
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
import { ConversationIdParamDto } from '../chat/chat.dto';
import {
  CallDto,
  CallIdParamDto,
  EndCallDto,
  IceServersDto,
} from './calls.dto';
import { CallsService } from './calls.service';

/** OQ-041: in-app audio calls (signaling over the realtime socket). */
@ApiTags('calls')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller()
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  @Post('conversations/:id/calls')
  @ApiOperation({ summary: 'Call the other chat member (audio only)' })
  @ApiEnvelopeResponse(CallDto, { status: 201 })
  @ApiErrors({
    403: [ErrorCode.SUBSCRIPTION_REQUIRED, ErrorCode.USER_BLOCKED],
    404: [ErrorCode.CONVERSATION_NOT_FOUND],
    409: [
      ErrorCode.CONVERSATION_CLOSED,
      ErrorCode.CALL_NOT_ALLOWED,
      ErrorCode.CALL_IN_PROGRESS,
    ],
    429: [ErrorCode.RATE_LIMITED],
  })
  startCall(
    @CurrentUser() user: RequestUser,
    @Param() p: ConversationIdParamDto,
  ): Promise<CallDto> {
    return this.calls.start(user, p.id);
  }

  @Get('calls/ice-servers')
  @ApiOperation({ summary: 'STUN/TURN servers for WebRTC' })
  @ApiEnvelopeResponse(IceServersDto)
  callIceServers(@CurrentUser() user: RequestUser): IceServersDto {
    return this.calls.iceServers(user);
  }

  @Get('calls/:id')
  @ApiOperation({ summary: 'One call' })
  @ApiEnvelopeResponse(CallDto)
  @ApiErrors({ 404: [ErrorCode.CALL_NOT_FOUND] })
  getCall(
    @CurrentUser() user: RequestUser,
    @Param() p: CallIdParamDto,
  ): Promise<CallDto> {
    return this.calls.get(user, p.id);
  }

  @Post('calls/:id/accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Pick up a ringing call (callee)' })
  @ApiEnvelopeResponse(CallDto)
  @ApiErrors({
    403: [ErrorCode.SUBSCRIPTION_REQUIRED],
    404: [ErrorCode.CALL_NOT_FOUND],
    409: [ErrorCode.CALL_STATE_CONFLICT],
  })
  acceptCall(
    @CurrentUser() user: RequestUser,
    @Param() p: CallIdParamDto,
  ): Promise<CallDto> {
    return this.calls.accept(user, p.id);
  }

  @Post('calls/:id/decline')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reject a ringing call (callee)' })
  @ApiEnvelopeResponse(CallDto)
  @ApiErrors({ 404: [ErrorCode.CALL_NOT_FOUND] })
  declineCall(
    @CurrentUser() user: RequestUser,
    @Param() p: CallIdParamDto,
  ): Promise<CallDto> {
    return this.calls.decline(user, p.id);
  }

  @Post('calls/:id/end')
  @HttpCode(200)
  @ApiOperation({ summary: 'Hang up / cancel (either side), idempotent' })
  @ApiEnvelopeResponse(CallDto)
  @ApiErrors({ 404: [ErrorCode.CALL_NOT_FOUND] })
  endCall(
    @CurrentUser() user: RequestUser,
    @Param() p: CallIdParamDto,
    @Body() dto: EndCallDto,
  ): Promise<CallDto> {
    return this.calls.end(user, p.id, dto);
  }
}
