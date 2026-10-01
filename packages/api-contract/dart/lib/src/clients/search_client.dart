// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/attorney_list_item_list_envelope.dart';
import '../models/case_feed_item_list_envelope.dart';
import '../models/period.dart';
import '../models/person_item_list_envelope.dart';
import '../models/post_kind.dart';
import '../models/post_list_envelope.dart';
import '../models/role2.dart';
import '../models/sort2.dart';
import '../models/sort3.dart';
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
  ///
  /// [verifiedOnly] - Only people with the check mark (verified).
  @GET('/search/people')
  Future<PersonItemListEnvelope> people({
    @Query('q') required String q,
    @Query('cursor') String? cursor,
    @Query('practiceAreaId') String? practiceAreaId,
    @Query('state') String? state,
    @Query('minRating') num? minRating,
    @Query('language') String? language,
    @Query('role') Role2? role,
    @Query('verifiedOnly') bool? verifiedOnly,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Cases visible to the attorney (docs/05 §7.4).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  ///
  /// [q] - Search text, at least 2 characters (§7.1).
  ///
  /// [budgetMin] - Whole dollars.
  ///
  /// [budgetMax] - Whole dollars.
  ///
  /// [budgetUnknown] - Only cases with "clarify later".
  ///
  /// [noBids] - Only cases nobody has bid on yet.
  @GET('/search/cases')
  Future<CaseFeedItemListEnvelope> cases({
    @Query('q') required String q,
    @Query('period') Period? period = Period.all,
    @Query('cursor') String? cursor,
    @Query('practiceAreaId') String? practiceAreaId,
    @Query('state') String? state,
    @Query('practiceCategory') String? practiceCategory,
    @Query('budgetMin') num? budgetMin,
    @Query('budgetMax') num? budgetMax,
    @Query('budgetUnknown') bool? budgetUnknown,
    @Query('noBids') bool? noBids,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Posts, full text (docs/05 §7.5).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  ///
  /// [q] - Search text, at least 2 characters (§7.1).
  ///
  /// [tag] - Only posts with this hashtag (topic).
  ///
  /// [state] - Only posts of attorneys licensed in this state.
  ///
  /// [withPhotos] - Only posts with photos.
  @GET('/search/posts')
  Future<PostListEnvelope> posts({
    @Query('q') required String q,
    @Query('period') Period? period = Period.all,
    @Query('sort') Sort2? sort = Sort2.relevance,
    @Query('cursor') String? cursor,
    @Query('tag') String? tag,
    @Query('state') String? state,
    @Query('withPhotos') bool? withPhotos,
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
  ///
  /// [state] - Only posts of attorneys licensed in this state (newest first).
  @GET('/tags/{tag}/posts')
  Future<PostListEnvelope> tagPosts({
    @Path('tag') required String tag,
    @Query('sort') Sort3? sort = Sort3.top,
    @Query('cursor') String? cursor,
    @Query('state') String? state,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Newest posts, by state (OQ-034), qualification and News (owner 2026-09-30).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  ///
  /// [practice] - Owner 2026-09-30: a practice category or subcategory code; a.
  /// category includes its subcategories.
  ///
  /// [tag] - Older posts without a qualification match by their topic hashtag.
  ///
  /// [kind] - Owner 2026-09-30: only News (or only regular posts).
  @GET('/search/latest-posts')
  Future<PostListEnvelope> latestPosts({
    @Query('cursor') String? cursor,
    @Query('state') String? state,
    @Query('practice') String? practice,
    @Query('tag') String? tag,
    @Query('kind') PostKind? kind,
    @Extras() Map<String, dynamic>? extras,
  });
}
