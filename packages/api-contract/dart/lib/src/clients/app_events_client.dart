// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/app_event_batch_dto.dart';

part 'app_events_client.g.dart';

@RestApi()
abstract class AppEventsClient {
  factory AppEventsClient(Dio dio, {String? baseUrl}) = _AppEventsClient;

  /// The app reports events (batch of up to 50)
  @POST('/app-events')
  Future<void> reportEvents({
    @Body() required AppEventBatchDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
