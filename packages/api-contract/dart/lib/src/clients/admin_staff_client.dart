// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/desk_decisions_envelope.dart';
import '../models/desk_settings_envelope.dart';
import '../models/staff_settings_envelope.dart';

part 'admin_staff_client.g.dart';

@RestApi()
abstract class AdminStaffClient {
  factory AdminStaffClient(Dio dio, {String? baseUrl}) = _AdminStaffClient;

  /// Staff package switches and numbers (all off by default)
  @GET('/admin/staff/settings')
  Future<StaffSettingsEnvelope> getStaffSettings({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Switches and timers the one-page desk needs (whitelist)
  @GET('/admin/workspace/desk-settings')
  Future<DeskSettingsEnvelope> deskSettings({
    @Extras() Map<String, dynamic>? extras,
  });

  /// My own closed items per day (nightly counters), newest first
  @GET('/admin/workspace/desk-decisions')
  Future<DeskDecisionsEnvelope> deskDecisions({
    @Query('days') num? days = 14,
    @Extras() Map<String, dynamic>? extras,
  });
}
