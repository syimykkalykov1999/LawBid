// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/call_envelope.dart';
import '../models/end_call_dto.dart';
import '../models/ice_servers_envelope.dart';
import '../models/start_call_dto.dart';
import '../models/video_call_config_envelope.dart';

part 'calls_client.g.dart';

@RestApi()
abstract class CallsClient {
  factory CallsClient(Dio dio, {String? baseUrl}) = _CallsClient;

  /// Call the other chat member (audio or video)
  @POST('/conversations/{id}/calls')
  Future<CallEnvelope> startCall({
    @Path('id') required String id,
    @Body() StartCallDto? body,
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
}
