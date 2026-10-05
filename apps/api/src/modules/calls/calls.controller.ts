import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
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
  StartCallDto,
  VideoCallConfigDto,
} from './calls.dto';
import { CallsService } from './calls.service';
import { RequiresDuty } from '../auth/assistant/assistant-context';

/** OQ-041: in-app audio calls (signaling over the realtime socket);
 * owner 2026-10-05: video calls behind `video_calls`. */
@ApiTags('calls')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
// OQ-048: assistants answer the attorney's calls with the "calls" duty.
@RequiresDuty('calls')
@Controller()
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  @Post('conversations/:id/calls')
  @ApiOperation({ summary: 'Call the other chat member (audio or video)' })
  // Optional: older apps send no body (an audio call).
  @ApiBody({ type: StartCallDto, required: false })
  @ApiEnvelopeResponse(CallDto, { status: 201 })
  @ApiErrors({
    403: [
      ErrorCode.SUBSCRIPTION_REQUIRED,
      ErrorCode.USER_BLOCKED,
      ErrorCode.ENTITLEMENT_REQUIRED,
      ErrorCode.FEATURE_DISABLED,
    ],
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
    @Body() dto: StartCallDto,
  ): Promise<CallDto> {
    return this.calls.start(user, p.id, dto ?? {});
  }

  @Get('calls/video')
  @ApiOperation({ summary: 'Whether video calls are available now' })
  @ApiEnvelopeResponse(VideoCallConfigDto)
  callVideoConfig(): Promise<VideoCallConfigDto> {
    return this.calls.videoConfig();
  }

  @Get('calls/ice-servers')
  @ApiOperation({ summary: 'STUN/TURN servers for WebRTC' })
  @ApiEnvelopeResponse(IceServersDto)
  callIceServers(@CurrentUser() user: RequestUser): Promise<IceServersDto> {
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
