// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/call_envelope.dart';
import '../models/call_history_item_list_envelope.dart';
import '../models/call_mute_dto.dart';
import '../models/cast_call_vote_dto.dart';
import '../models/end_call_dto.dart';
import '../models/hidden_calls_envelope.dart';
import '../models/hide_calls_dto.dart';
import '../models/ice_servers_envelope.dart';
import '../models/invite_call_dto.dart';
import '../models/ongoing_group_call_list_envelope.dart';
import '../models/start_call_dto.dart';
import '../models/start_call_vote_dto.dart';
import '../models/start_group_call_dto.dart';
import '../models/video_call_config_envelope.dart';

part 'calls_client.g.dart';

@RestApi()
abstract class CallsClient {
  factory CallsClient(Dio dio, {String? baseUrl}) = _CallsClient;

  /// My finished calls, newest first (cursor).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/calls/history')
  Future<CallHistoryItemListEnvelope> callHistory({
    @Query('cursor') String? cursor,
    @Query('limit') int? limit,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Clear my calls list (others keep theirs)
  @DELETE('/calls/history')
  Future<HiddenCallsEnvelope> clearCalls({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete calls from my list (others keep theirs)
  @POST('/calls/history/hide')
  Future<HiddenCallsEnvelope> hideCalls({
    @Body() required HideCallsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Group calls running now in my groups
  @GET('/calls/ongoing')
  Future<OngoingGroupCallListEnvelope> ongoingGroupCalls({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Call the other chat member (audio or video)
  @POST('/conversations/{id}/calls')
  Future<CallEnvelope> startCall({
    @Path('id') required String id,
    @Body() StartCallDto? body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Start a call from a group chat (audio or video)
  @POST('/groups/{id}/calls')
  Future<CallEnvelope> startGroupCall({
    @Path('id') required String id,
    @Body() StartGroupCallDto? body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The call running in a group chat (404 when none)
  @GET('/groups/{id}/call')
  Future<CallEnvelope> groupCall({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Join the call running in your group chat
  @POST('/calls/{id}/join')
  Future<CallEnvelope> joinCall({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Whether video calls are available now
  @GET('/calls/video')
  Future<VideoCallConfigEnvelope> callVideoConfig({
    @Extras() Map<String, dynamic>? extras,
  });

  /// STUN/TURN servers for WebRTC
  @GET('/calls/ice-servers')
  Future<IceServersEnvelope> callIceServers({
    @Extras() Map<String, dynamic>? extras,
  });

  /// One call
  @GET('/calls/{id}')
  Future<CallEnvelope> getCall({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Pick up a ringing call (callee)
  @POST('/calls/{id}/accept')
  Future<CallEnvelope> acceptCall({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Reject a ringing call (callee)
  @POST('/calls/{id}/decline')
  Future<CallEnvelope> declineCall({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Hang up / cancel (either side), idempotent
  @POST('/calls/{id}/end')
  Future<CallEnvelope> endCall({
    @Path('id') required String id,
    @Body() required EndCallDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Add a person to the running call (group call)
  @POST('/calls/{id}/participants')
  Future<CallEnvelope> inviteToCall({
    @Path('id') required String id,
    @Body() required InviteCallDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Host: switch a member's microphone off / allow it
  @POST('/calls/{id}/participants/{userId}/mute')
  Future<CallEnvelope> muteParticipant({
    @Path('id') required String id,
    @Path('userId') required String userId,
    @Body() required CallMuteDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Host: remove a member from the call
  @DELETE('/calls/{id}/participants/{userId}')
  Future<CallEnvelope> removeFromCall({
    @Path('id') required String id,
    @Path('userId') required String userId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Propose to remove a member (only while nobody who runs the call is in it)
  @POST('/calls/{id}/votes')
  Future<CallEnvelope> startVote({
    @Path('id') required String id,
    @Body() required StartCallVoteDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Vote for / against removing the member
  @POST('/calls/{id}/votes/{voteId}')
  Future<CallEnvelope> castVote({
    @Path('id') required String id,
    @Path('voteId') required String voteId,
    @Body() required CastCallVoteDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Tell the call my microphone is off / on
  @POST('/calls/{id}/mute-state')
  Future<CallEnvelope> muteState({
    @Path('id') required String id,
    @Body() required CallMuteDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
