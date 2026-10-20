// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_deadline_rule_envelope.dart';
import '../models/admin_deadline_rule_list_envelope.dart';
import '../models/admin_holiday_envelope.dart';
import '../models/admin_holiday_list_envelope.dart';
import '../models/create_deadline_rule_dto.dart';
import '../models/create_holiday_dto.dart';
import '../models/generate_federal_holidays_dto.dart';
import '../models/generate_federal_holidays_result_envelope.dart';
import '../models/update_deadline_rule_dto.dart';

part 'admin_deadlines_client.g.dart';

@RestApi()
abstract class AdminDeadlinesClient {
  factory AdminDeadlinesClient(Dio dio, {String? baseUrl}) =
      _AdminDeadlinesClient;

  /// All rules, active or not
  @GET('/admin/deadlines/rules')
  Future<AdminDeadlineRuleListEnvelope> listAdminDeadlineRules({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Add a rule
  @POST('/admin/deadlines/rules')
  Future<AdminDeadlineRuleEnvelope> createAdminDeadlineRule({
    @Body() required CreateDeadlineRuleDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Edit a rule
  @PATCH('/admin/deadlines/rules/{id}')
  Future<AdminDeadlineRuleEnvelope> updateAdminDeadlineRule({
    @Path('id') required String id,
    @Body() required UpdateDeadlineRuleDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete a rule
  @DELETE('/admin/deadlines/rules/{id}')
  Future<void> deleteAdminDeadlineRule({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Court holidays (filter by jurisdiction, year)
  @GET('/admin/deadlines/holidays')
  Future<AdminHolidayListEnvelope> listAdminDeadlineHolidays({
    @Query('jurisdiction') String? jurisdiction,
    @Query('year') num? year,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Add or rename a court holiday
  @POST('/admin/deadlines/holidays')
  Future<AdminHolidayEnvelope> createAdminDeadlineHoliday({
    @Body() required CreateHolidayDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Add the federal holidays of a year (open data)
  @POST('/admin/deadlines/holidays/federal')
  Future<GenerateFederalHolidaysResultEnvelope> generateAdminFederalHolidays({
    @Body() required GenerateFederalHolidaysDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete a court holiday
  @DELETE('/admin/deadlines/holidays/{id}')
  Future<void> deleteAdminDeadlineHoliday({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
