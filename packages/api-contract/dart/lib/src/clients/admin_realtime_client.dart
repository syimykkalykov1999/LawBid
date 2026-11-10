// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_realtime_ticket_envelope.dart';

part 'admin_realtime_client.g.dart';

@RestApi()
abstract class AdminRealtimeClient {
  factory AdminRealtimeClient(Dio dio, {String? baseUrl}) =
      _AdminRealtimeClient;

  /// One-shot ticket for the admin live-updates socket (namespace /admin)
  @POST('/admin/realtime/ticket')
  Future<AdminRealtimeTicketEnvelope> ticket({
    @Extras() Map<String, dynamic>? extras,
  });
}
