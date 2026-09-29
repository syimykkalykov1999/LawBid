// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/attorney_list_item_list_envelope.dart';
import '../models/case_feed_item_list_envelope.dart';
import '../models/period.dart';
import '../models/person_item_list_envelope.dart';
import '../models/post_list_envelope.dart';
import '../models/sort2.dart';
import '../models/tag_list_envelope.dart';

part 'search_client.g.dart';

@RestApi()
abstract class SearchClient {
  factory SearchClient(Dio dio, {String? baseUrl}) = _SearchClient;

  /// Attorneys / people (docs/05 §7.3).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  ///
  /// [q] - Search text, at least 2 characters (§7.1).
  @GET('/search/attorneys')
  Future<AttorneyListItemListEnvelope> attorneys({
    @Query('q') required String q,
    @Query('cursor') String? cursor,
    @Query('practiceAreaId') String? practiceAreaId,
    @Query('state') String? state,
    @Query('minRating') num? minRating,
    @Query('language') String? language,
    @Extras() Map<String, dynamic>? extras,
  });

  /// People: attorneys and clients by @username / name (OQ-026).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  ///
  /// [q] - Search text, at least 2 characters (§7.1).
  @GET('/search/people')
  Future<PersonItemListEnvelope> people({
    @Query('q') required String q,
    @Query('cursor') String? cursor,
    @Query('practiceAreaId') String? practiceAreaId,
    @Query('state') String? state,
    @Query('minRating') num? minRating,
    @Query('language') String? language,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Cases visible to the attorney (docs/05 §7.4).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  ///
  /// [q] - Search text, at least 2 characters (§7.1).
  @GET('/search/cases')
  Future<CaseFeedItemListEnvelope> cases({
    @Query('q') required String q,
    @Query('period') Period? period = Period.all,
    @Query('cursor') String? cursor,
    @Query('practiceAreaId') String? practiceAreaId,
    @Query('state') String? state,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Posts, full text (docs/05 §7.5).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  ///
  /// [q] - Search text, at least 2 characters (§7.1).
  @GET('/search/posts')
  Future<PostListEnvelope> posts({
    @Query('q') required String q,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Hashtags by prefix (docs/05 §7.5).
  ///
  /// [q] - Hashtag prefix, with or without "#".
  @GET('/search/tags')
  Future<TagListEnvelope> tags({
    @Query('q') required String q,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Top hashtags of 7 days (docs/05 §7.2)
  @GET('/search/trending-tags')
  Future<TagListEnvelope> trending({@Extras() Map<String, dynamic>? extras});

  /// Posts of a hashtag, top or new (docs/05 §7.5).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/tags/{tag}/posts')
  Future<PostListEnvelope> tagPosts({
    @Path('tag') required String tag,
    @Query('sort') Sort2? sort = Sort2.top,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });
}
