// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/practice_area_category_list_envelope.dart';

part 'practice_areas_client.g.dart';

@RestApi()
abstract class PracticeAreasClient {
  factory PracticeAreasClient(Dio dio, {String? baseUrl}) =
      _PracticeAreasClient;

  /// [ifNoneMatch] - ETag of the tree the client already has.
  @GET('/practice-areas')
  Future<PracticeAreaCategoryListEnvelope> listPracticeAreas({
    @Header('If-None-Match') String? ifNoneMatch,
    @Extras() Map<String, dynamic>? extras,
  });
}
