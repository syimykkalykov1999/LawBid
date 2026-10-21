// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_group_detail_envelope.dart';
import '../models/admin_group_list_envelope.dart';

part 'admin_group_chats_client.g.dart';

@RestApi()
abstract class AdminGroupChatsClient {
  factory AdminGroupChatsClient(Dio dio, {String? baseUrl}) =
      _AdminGroupChatsClient;

  /// Group chats, newest first.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  ///
  /// [q] - Part of the title.
  @GET('/admin/group-chats')
  Future<AdminGroupListEnvelope> adminListGroupChats({
    @Query('cursor') String? cursor,
    @Query('q') String? q,
    @Extras() Map<String, dynamic>? extras,
  });

  /// One group with its members
  @GET('/admin/group-chats/{id}')
  Future<AdminGroupDetailEnvelope> adminGetGroupChat({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Close the group for everyone
  @DELETE('/admin/group-chats/{id}')
  Future<void> adminDeleteGroupChat({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Remove a member from the group
  @DELETE('/admin/group-chats/{id}/members/{userId}')
  Future<void> adminRemoveGroupChatMember({
    @Path('id') required String id,
    @Path('userId') required String userId,
    @Extras() Map<String, dynamic>? extras,
  });
}
