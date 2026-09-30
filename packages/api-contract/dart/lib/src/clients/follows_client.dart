// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/attorney_list_item_list_envelope.dart';
import '../models/person_item_list_envelope.dart';

part 'follows_client.g.dart';

@RestApi()
abstract class FollowsClient {
  factory FollowsClient(Dio dio, {String? baseUrl}) = _FollowsClient;

  /// Follow an attorney (idempotent, docs/05 §6.1)
  @POST('/attorneys/{id}/follow')
  Future<void> followAttorney({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Unfollow (idempotent)
  @DELETE('/attorneys/{id}/follow')
  Future<void> unfollowAttorney({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Attorney followers — attorneys and clients (OQ-026).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/attorneys/{id}/followers')
  Future<PersonItemListEnvelope> listFollowers({
    @Path('id') required String id,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Whom a user follows — attorneys and clients (OQ-038).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/attorneys/{id}/following')
  Future<PersonItemListEnvelope> listFollowing({
    @Path('id') required String id,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My follows (docs/05 §6.2).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/users/me/following')
  Future<AttorneyListItemListEnvelope> listMyFollowing({
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Recommended attorneys (docs/05 §6.3).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/suggestions/attorneys')
  Future<AttorneyListItemListEnvelope> listSuggestedAttorneys({
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });
}
