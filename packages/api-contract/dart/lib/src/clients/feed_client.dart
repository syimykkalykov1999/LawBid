// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/post_list_envelope.dart';

part 'feed_client.g.dart';

@RestApi()
abstract class FeedClient {
  factory FeedClient(Dio dio, {String? baseUrl}) = _FeedClient;

  /// Feed: followed + recommended posts (docs/05 §2.2).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/feed')
  Future<PostListEnvelope> getFeed({
    @Query('limit') num? limit = 20,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });
}
