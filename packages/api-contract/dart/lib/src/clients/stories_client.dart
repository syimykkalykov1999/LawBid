// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/create_story_dto.dart';
import '../models/create_story_video_upload_dto.dart';
import '../models/story_envelope.dart';
import '../models/story_list_envelope.dart';
import '../models/story_settings_envelope.dart';
import '../models/story_tray_item_list_envelope.dart';
import '../models/story_viewer_list_envelope.dart';
import '../models/update_story_settings_dto.dart';
import '../models/user_brief_list_envelope.dart';
import '../models/video_upload_envelope.dart';

part 'stories_client.g.dart';

@RestApi()
abstract class StoriesClient {
  factory StoriesClient(Dio dio, {String? baseUrl}) = _StoriesClient;

  /// Story bubbles: me first, then people I follow
  @GET('/stories/tray')
  Future<StoryTrayItemListEnvelope> storyTray({
    @Extras() Map<String, dynamic>? extras,
  });

  /// My expired stories, newest first.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/stories/archive')
  Future<StoryListEnvelope> storyArchive({
    @Query('cursor') String? cursor,
    @Query('limit') num? limit,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My story privacy
  @GET('/stories/settings')
  Future<StorySettingsEnvelope> storySettings({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Change my story privacy
  @PATCH('/stories/settings')
  Future<StorySettingsEnvelope> storyUpdateSettings({
    @Body() required UpdateStorySettingsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// People my stories are hidden from
  @GET('/stories/hidden')
  Future<UserBriefListEnvelope> storyHidden({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Hide my stories from a person
  @PUT('/stories/hidden/{userId}')
  Future<void> storyHide({
    @Path('userId') required String userId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Show my stories to a person again
  @DELETE('/stories/hidden/{userId}')
  Future<void> storyUnhide({
    @Path('userId') required String userId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Start a direct upload of a story video (≤ 15 s)
  @POST('/stories/video-uploads')
  Future<VideoUploadEnvelope> storyCreateVideoUpload({
    @Body() required CreateStoryVideoUploadDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Post a story
  @POST('/stories')
  Future<StoryEnvelope> storyCreate({
    @Body() required CreateStoryDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// A person's live stories I may see
  @GET('/stories/users/{userId}')
  Future<StoryListEnvelope> storyOfUser({
    @Path('userId') required String userId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete my story
  @DELETE('/stories/{id}')
  Future<void> storyRemove({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Mark a story as seen
  @POST('/stories/{id}/view')
  Future<void> storyView({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Who saw my story (author only).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/stories/{id}/viewers')
  Future<StoryViewerListEnvelope> storyViewers({
    @Path('id') required String id,
    @Query('cursor') String? cursor,
    @Query('limit') num? limit,
    @Extras() Map<String, dynamic>? extras,
  });
}
