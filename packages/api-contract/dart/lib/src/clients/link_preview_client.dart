// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/link_preview_envelope.dart';

part 'link_preview_client.g.dart';

@RestApi()
abstract class LinkPreviewClient {
  factory LinkPreviewClient(Dio dio, {String? baseUrl}) = _LinkPreviewClient;

  /// Preview card of a link (Open Graph), fetched safely by the server.
  ///
  /// [url] - The link as pasted (https://…).
  @GET('/link-preview')
  Future<LinkPreviewEnvelope> linkPreview({
    @Query('url') required String url,
    @Extras() Map<String, dynamic>? extras,
  });
}
