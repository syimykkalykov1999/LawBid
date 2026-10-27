// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/staff_ai_hint_envelope.dart';
import '../models/staff_ai_summary_envelope.dart';
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

  /// AI suggestion for an item the caller holds (one call, 3 s timeout, cached; a suggestion only).
  ///
  /// [kind] - Queue kind of the item: support_ticket, report, verification.
  ///
  /// [itemId] - The item the caller holds.
  @GET('/admin/desk/ai/hint/{kind}/{itemId}')
  Future<StaffAiHintEnvelope> staffAiHint({
    @Path('kind') required String kind,
    @Path('itemId') required String itemId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Evidence text under a recommendation: AI text if written, else the rule-based template.
  ///
  /// [suggestionId] - staff_suggestions.id.
  @GET('/admin/desk/ai/summary/{suggestionId}')
  Future<StaffAiSummaryEnvelope> staffAiSummary({
    @Path('suggestionId') required String suggestionId,
    @Extras() Map<String, dynamic>? extras,
  });
}
