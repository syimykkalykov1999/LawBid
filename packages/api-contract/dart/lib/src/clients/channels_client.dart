// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/add_channel_admin_dto.dart';
import '../models/channel_admin_list_envelope.dart';
import '../models/channel_comment_envelope.dart';
import '../models/channel_comment_list_envelope.dart';
import '../models/channel_envelope.dart';
import '../models/channel_list_envelope.dart';
import '../models/channel_post_envelope.dart';
import '../models/channel_post_list_envelope.dart';
import '../models/channel_reaction_dto.dart';
import '../models/channel_subscription_envelope.dart';
import '../models/channel_views_dto.dart';
import '../models/create_channel_comment_dto.dart';
import '../models/create_channel_dto.dart';
import '../models/create_channel_post_dto.dart';
import '../models/create_video_upload_dto.dart';
import '../models/scope2.dart';
import '../models/update_channel_dto.dart';
import '../models/update_channel_post_dto.dart';
import '../models/update_channel_subscription_dto.dart';
import '../models/video_upload_envelope.dart';

part 'channels_client.g.dart';

@RestApi()
abstract class ChannelsClient {
  factory ChannelsClient(Dio dio, {String? baseUrl}) = _ChannelsClient;

  /// Channels: discover / search, the ones I follow, the ones I run.
  ///
  /// [archived] - Owner 2026-10-21: the Archive of the channels (subscribed / managed).
  ///
  /// [q] - Title or @username.
  ///
  /// [cursor] - Discover without q: opaque cursor of the ranked list.
  ///
  /// [updatedSince] - Owner 2026-10-22 (client economy plan, package F): subscribed / managed only — the channels whose row changed since (a post, settings); meta.deletedIds = channels that left the list (banned, deleted); meta.syncedAt = pass it back next time. My own unsubscribe / pin / archive is applied locally. Older than 7 days → 409 SYNC_TOO_OLD.
  @GET('/channels')
  Future<ChannelListEnvelope> channelList({
    @Query('archived') bool? archived,
    @Query('q') String? q,
    @Query('cursor') String? cursor,
    @Query('updatedSince') DateTime? updatedSince,
    @Query('scope') Scope2? scope = Scope2.discover,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Create a channel (verified attorneys and clients)
  @POST('/channels')
  Future<ChannelEnvelope> channelCreate({
    @Body() required CreateChannelDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Start a direct upload of a channel post video
  @POST('/channels/video-uploads')
  Future<VideoUploadEnvelope> channelCreateVideoUpload({
    @Body() required CreateVideoUploadDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// A channel by id or @username.
  ///
  /// [ref] - Channel id or @username.
  @GET('/channels/{ref}')
  Future<ChannelEnvelope> channelGet({
    @Path('ref') required String ref,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Edit a channel (admins; @username: owner)
  @PATCH('/channels/{id}')
  Future<ChannelEnvelope> channelUpdate({
    @Path('id') required String id,
    @Body() required UpdateChannelDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete a channel (owner)
  @DELETE('/channels/{id}')
  Future<void> channelRemove({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Subscribe
  @PUT('/channels/{id}/subscription')
  Future<ChannelSubscriptionEnvelope> channelSubscribe({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Unsubscribe
  @DELETE('/channels/{id}/subscription')
  Future<ChannelSubscriptionEnvelope> channelUnsubscribe({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My mute (timed or forever), pin and Archive of a channel
  @PATCH('/channels/{id}/subscription')
  Future<ChannelSubscriptionEnvelope> channelMute({
    @Path('id') required String id,
    @Body() required UpdateChannelSubscriptionDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Owner and admins of a channel (admins only)
  @GET('/channels/{id}/admins')
  Future<ChannelAdminListEnvelope> channelAdmins({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Add an admin by @username (owner)
  @POST('/channels/{id}/admins')
  Future<ChannelAdminListEnvelope> channelAddAdmin({
    @Path('id') required String id,
    @Body() required AddChannelAdminDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Remove an admin (owner), or leave (yourself)
  @DELETE('/channels/{id}/admins/{userId}')
  Future<void> channelRemoveAdmin({
    @Path('id') required String id,
    @Path('userId') required String userId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Posts of a channel, newest first.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/channels/{id}/posts')
  Future<ChannelPostListEnvelope> channelPosts({
    @Path('id') required String id,
    @Query('cursor') String? cursor,
    @Query('limit') num? limit,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Publish a post (admins)
  @POST('/channels/{id}/posts')
  Future<ChannelPostEnvelope> channelCreatePost({
    @Path('id') required String id,
    @Body() required CreateChannelPostDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Count the posts a reader saw (once per person)
  @POST('/channels/{id}/views')
  Future<void> channelMarkViewed({
    @Path('id') required String id,
    @Body() required ChannelViewsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Count a share of a post (one per person per day)
  @POST('/channels/{id}/posts/{postId}/share')
  Future<void> channelSharePost({
    @Path('id') required String id,
    @Path('postId') required String postId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// One post of a channel
  @GET('/channels/{id}/posts/{postId}')
  Future<ChannelPostEnvelope> channelPost({
    @Path('id') required String id,
    @Path('postId') required String postId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Edit a post (admins)
  @PATCH('/channels/{id}/posts/{postId}')
  Future<ChannelPostEnvelope> channelEditPost({
    @Path('id') required String id,
    @Path('postId') required String postId,
    @Body() required UpdateChannelPostDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete a post (admins)
  @DELETE('/channels/{id}/posts/{postId}')
  Future<void> channelRemovePost({
    @Path('id') required String id,
    @Path('postId') required String postId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// React to a post with one emoji
  @PUT('/channels/{id}/posts/{postId}/reaction')
  Future<ChannelPostEnvelope> channelReact({
    @Path('id') required String id,
    @Path('postId') required String postId,
    @Body() required ChannelReactionDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Take my reaction back
  @DELETE('/channels/{id}/posts/{postId}/reaction')
  Future<ChannelPostEnvelope> channelUnreact({
    @Path('id') required String id,
    @Path('postId') required String postId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Comments under a post, oldest first.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/channels/{id}/posts/{postId}/comments')
  Future<ChannelCommentListEnvelope> channelComments({
    @Path('id') required String id,
    @Path('postId') required String postId,
    @Query('cursor') String? cursor,
    @Query('limit') num? limit,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Comment on a post
  @POST('/channels/{id}/posts/{postId}/comments')
  Future<ChannelCommentEnvelope> channelAddComment({
    @Path('id') required String id,
    @Path('postId') required String postId,
    @Body() required CreateChannelCommentDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete a comment (author or a channel admin)
  @DELETE('/channels/{id}/posts/{postId}/comments/{commentId}')
  Future<void> channelRemoveComment({
    @Path('id') required String id,
    @Path('postId') required String postId,
    @Path('commentId') required String commentId,
    @Extras() Map<String, dynamic>? extras,
  });
}
