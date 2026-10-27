// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/deadline_holiday_list_envelope.dart';
import '../models/deadline_result_envelope.dart';
import '../models/deadline_rule_list_envelope.dart';
import '../models/kind4.dart';

part 'deadlines_client.g.dart';

@RestApi()
abstract class DeadlinesClient {
  factory DeadlinesClient(Dio dio, {String? baseUrl}) = _DeadlinesClient;

  /// Deadline rules: federal plus a state’s.
  ///
  /// [jurisdiction] - Federal rules plus this state’s.
  ///
  /// [practiceCode] - Statutes for this practice category code.
  @GET('/deadlines/rules')
  Future<DeadlineRuleListEnvelope> listDeadlineRules({
    @Query('jurisdiction') String? jurisdiction,
    @Query('kind') Kind4? kind,
    @Query('practiceCode') String? practiceCode,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Court holidays of a year
  @GET('/deadlines/holidays')
  Future<DeadlineHolidayListEnvelope> listDeadlineHolidays({
    @Query('year') required num year,
    @Query('jurisdiction') String? jurisdiction = 'US',
    @Extras() Map<String, dynamic>? extras,
  });

  /// The last day for a rule counted from an event date.
  ///
  /// [eventDate] - The event date (service, ruling, accident…).
  @GET('/deadlines/calculate')
  Future<DeadlineResultEnvelope> calculateDeadline({
    @Query('ruleCode') required String ruleCode,
    @Query('eventDate') required String eventDate,
    @Extras() Map<String, dynamic>? extras,
  });
}
