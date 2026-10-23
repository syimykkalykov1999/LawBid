// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/missed_events_envelope.dart';

part 'realtime_client.g.dart';

@RestApi()
abstract class RealtimeClient {
  factory RealtimeClient(Dio dio, {String? baseUrl}) = _RealtimeClient;

  /// Realtime events missed since a cursor (last 5 minutes, at most 200).
  ///
  /// [since] - The `seq` of the last realtime event the app saw (or of `realtime:ready`). 0 = nothing seen: the answer is `complete: false`.
  @GET('/realtime/missed')
  Future<MissedEventsEnvelope> missed({
    @Query('since') required num since,
    @Extras() Map<String, dynamic>? extras,
  });
}
