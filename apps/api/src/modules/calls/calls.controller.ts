import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
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
  CallMuteDto,
  CallParticipantParamDto,
  CallVoteParamDto,
  CastCallVoteDto,
  EndCallDto,
  IceServersDto,
  InviteCallDto,
  LiveKitJoinDto,
  GroupCallParamDto,
  StartCallDto,
  StartCallVoteDto,
  StartGroupCallDto,
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

  @Post('groups/:id/calls')
  @ApiOperation({
    summary: 'Start a call from a group chat (audio or video)',
  })
  @ApiBody({ type: StartGroupCallDto, required: false })
  @ApiEnvelopeResponse(CallDto, { status: 201 })
  @ApiErrors({
    403: [
      ErrorCode.GROUP_FORBIDDEN,
      ErrorCode.ENTITLEMENT_REQUIRED,
      ErrorCode.FEATURE_DISABLED,
    ],
    404: [ErrorCode.GROUP_NOT_FOUND],
    409: [ErrorCode.CALL_IN_PROGRESS],
  })
  startGroupCall(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupCallParamDto,
    @Body() dto: StartGroupCallDto,
  ): Promise<CallDto> {
    return this.calls.startGroupCall(user, p.id, dto ?? {});
  }

  @Get('groups/:id/call')
  @ApiOperation({ summary: 'The call running in a group chat (404 when none)' })
  @ApiEnvelopeResponse(CallDto)
  @ApiErrors({ 404: [ErrorCode.GROUP_NOT_FOUND, ErrorCode.CALL_NOT_FOUND] })
  groupCall(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupCallParamDto,
  ): Promise<CallDto> {
    return this.calls.groupCall(user, p.id);
  }

  @Post('channels/:id/calls')
  @ApiOperation({
    summary:
      'Start the call of a channel (owner / admins; joins the running one)',
  })
  @ApiBody({ type: StartCallDto, required: false })
  @ApiEnvelopeResponse(CallDto, { status: 201 })
  @ApiErrors({
    403: [
      ErrorCode.FORBIDDEN,
      ErrorCode.ENTITLEMENT_REQUIRED,
      ErrorCode.FEATURE_DISABLED,
    ],
    404: [ErrorCode.NOT_FOUND],
    409: [ErrorCode.CALL_IN_PROGRESS, ErrorCode.CALL_STATE_CONFLICT],
  })
  startChannelCall(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupCallParamDto,
    @Body() dto: StartCallDto,
  ): Promise<CallDto> {
    return this.calls.startChannelCall(user, p.id, dto ?? {});
  }

  @Get('channels/:id/call')
  @ApiOperation({ summary: 'The call running in a channel (404 when none)' })
  @ApiEnvelopeResponse(CallDto)
  @ApiErrors({
    403: [ErrorCode.FORBIDDEN, ErrorCode.FEATURE_DISABLED],
    404: [ErrorCode.NOT_FOUND, ErrorCode.CALL_NOT_FOUND],
  })
  channelCall(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupCallParamDto,
  ): Promise<CallDto> {
    return this.calls.channelCall(user, p.id);
  }

  @Post('calls/:id/join')
  @HttpCode(200)
  @ApiOperation({ summary: 'Join the call running in your group chat' })
  @ApiEnvelopeResponse(CallDto)
  @ApiErrors({
    403: [ErrorCode.ENTITLEMENT_REQUIRED, ErrorCode.FORBIDDEN],
    404: [ErrorCode.CALL_NOT_FOUND, ErrorCode.GROUP_NOT_FOUND],
    409: [ErrorCode.CALL_IN_PROGRESS, ErrorCode.CALL_STATE_CONFLICT],
  })
  joinCall(
    @CurrentUser() user: RequestUser,
    @Param() p: CallIdParamDto,
  ): Promise<CallDto> {
    return this.calls.joinCall(user, p.id);
  }

  @Get('calls/video')
  @ApiOperation({ summary: 'Whether video calls are available now' })
  @ApiEnvelopeResponse(VideoCallConfigDto)
  callVideoConfig(): Promise<VideoCallConfigDto> {
    return this.calls.videoConfig();
  }

  @Post('calls/:id/livekit-token')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'LiveKit room access for this call (only while calls run on LiveKit)',
  })
  @ApiEnvelopeResponse(LiveKitJoinDto)
  @ApiErrors({
    404: [ErrorCode.CALL_NOT_FOUND],
    409: [ErrorCode.CALL_STATE_CONFLICT],
  })
  livekitToken(
    @CurrentUser() user: RequestUser,
    @Param() p: CallIdParamDto,
  ): Promise<LiveKitJoinDto> {
    return this.calls.livekitToken(user, p.id);
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

  @Post('calls/:id/participants')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Add a person to the running call (group call)',
  })
  @ApiEnvelopeResponse(CallDto)
  @ApiErrors({
    403: [
      ErrorCode.SUBSCRIPTION_REQUIRED,
      ErrorCode.USER_BLOCKED,
      ErrorCode.ENTITLEMENT_REQUIRED,
    ],
    404: [ErrorCode.CALL_NOT_FOUND, ErrorCode.NOT_FOUND],
    409: [
      ErrorCode.CALL_NOT_ALLOWED,
      ErrorCode.CALL_IN_PROGRESS,
      ErrorCode.CALL_STATE_CONFLICT,
    ],
  })
  inviteToCall(
    @CurrentUser() user: RequestUser,
    @Param() p: CallIdParamDto,
    @Body() dto: InviteCallDto,
  ): Promise<CallDto> {
    return this.calls.invite(user, p.id, dto);
  }

  @Post('calls/:id/participants/:userId/mute')
  @HttpCode(200)
  @ApiOperation({
    summary: "Host: switch a member's microphone off / allow it",
  })
  @ApiEnvelopeResponse(CallDto)
  @ApiErrors({
    403: [ErrorCode.FORBIDDEN],
    404: [ErrorCode.CALL_NOT_FOUND],
    409: [ErrorCode.CALL_STATE_CONFLICT],
  })
  muteParticipant(
    @CurrentUser() user: RequestUser,
    @Param() p: CallParticipantParamDto,
    @Body() dto: CallMuteDto,
  ): Promise<CallDto> {
    return this.calls.muteParticipant(user, p.id, p.userId, dto.muted);
  }

  @Delete('calls/:id/participants/:userId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Host: remove a member from the call' })
  @ApiEnvelopeResponse(CallDto)
  @ApiErrors({
    403: [ErrorCode.FORBIDDEN],
    404: [ErrorCode.CALL_NOT_FOUND],
    409: [ErrorCode.CALL_STATE_CONFLICT],
  })
  removeFromCall(
    @CurrentUser() user: RequestUser,
    @Param() p: CallParticipantParamDto,
  ): Promise<CallDto> {
    return this.calls.removeParticipant(user, p.id, p.userId);
  }

  @Post('calls/:id/votes')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Propose to remove a member (only while nobody who runs the call is in it)',
  })
  @ApiEnvelopeResponse(CallDto)
  @ApiErrors({
    403: [ErrorCode.FORBIDDEN],
    404: [ErrorCode.CALL_NOT_FOUND],
    409: [ErrorCode.CALL_STATE_CONFLICT],
  })
  startVote(
    @CurrentUser() user: RequestUser,
    @Param() p: CallIdParamDto,
    @Body() dto: StartCallVoteDto,
  ): Promise<CallDto> {
    return this.calls.startVote(user, p.id, dto.targetId);
  }

  @Post('calls/:id/votes/:voteId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Vote for / against removing the member' })
  @ApiEnvelopeResponse(CallDto)
  @ApiErrors({
    403: [ErrorCode.FORBIDDEN],
    404: [ErrorCode.CALL_NOT_FOUND],
    409: [ErrorCode.CALL_STATE_CONFLICT],
  })
  castVote(
    @CurrentUser() user: RequestUser,
    @Param() p: CallVoteParamDto,
    @Body() dto: CastCallVoteDto,
  ): Promise<CallDto> {
    return this.calls.castVote(user, p.id, p.voteId, dto.favor);
  }

  @Post('calls/:id/mute-state')
  @HttpCode(200)
  @ApiOperation({ summary: 'Tell the call my microphone is off / on' })
  @ApiEnvelopeResponse(CallDto)
  @ApiErrors({ 404: [ErrorCode.CALL_NOT_FOUND] })
  muteState(
    @CurrentUser() user: RequestUser,
    @Param() p: CallIdParamDto,
    @Body() dto: CallMuteDto,
  ): Promise<CallDto> {
    return this.calls.setMuteState(user, p.id, dto.muted);
  }
}
