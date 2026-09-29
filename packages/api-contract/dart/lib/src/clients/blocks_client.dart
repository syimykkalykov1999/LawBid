// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/blocked_user_list_envelope.dart';

part 'blocks_client.g.dart';

@RestApi()
abstract class BlocksClient {
  factory BlocksClient(Dio dio, {String? baseUrl}) = _BlocksClient;

  /// Users I blocked (OQ-028)
  @GET('/users/me/blocks')
  Future<BlockedUserListEnvelope> listBlocks({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Block a user (OQ-028); idempotent
  @PUT('/users/{id}/block')
  Future<void> block({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Unblock a user (OQ-028); idempotent
  @DELETE('/users/{id}/block')
  Future<void> unblock({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
