// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/aws_budgets_envelope.dart';
import '../models/budget_delete_request_dto.dart';
import '../models/budget_limit_request_dto.dart';
import '../models/launch_report_envelope.dart';
import '../models/launch_tick_dto.dart';
import '../models/paging_status_envelope.dart';
import '../models/restore_drill_dto.dart';

part 'admin_launch_client.g.dart';

@RestApi()
abstract class AdminLaunchClient {
  factory AdminLaunchClient(Dio dio, {String? baseUrl}) = _AdminLaunchClient;

  /// The launch checklist with live lights
  @GET('/admin/launch')
  Future<LaunchReportEnvelope> launchReport({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Check everything again now (at most 6 a minute)
  @POST('/admin/launch/refresh')
  Future<LaunchReportEnvelope> refreshLaunch({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Tick / untick a step nothing can detect
  @POST('/admin/launch/ticks/{id}')
  Future<LaunchReportEnvelope> tickLaunchItem({
    @Path('id') required String id,
    @Body() required LaunchTickDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Record that the restore drill was done today (needs step-up)
  @POST('/admin/launch/restore-drill')
  Future<LaunchReportEnvelope> recordRestoreDrill({
    @Body() required RestoreDrillDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// PagerDuty subscription state on the critical topic
  @GET('/admin/launch/pagerduty')
  Future<PagingStatusEnvelope> getPagingStatus({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Subscribe the saved PagerDuty link, drop the old one (needs step-up)
  @POST('/admin/launch/pagerduty/sync')
  Future<PagingStatusEnvelope> syncPaging({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Publish a test alarm to the critical topic: the phone will ring (needs step-up)
  @POST('/admin/launch/pagerduty/test')
  Future<PagingStatusEnvelope> testPaging({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Every AWS budget of the account
  @GET('/admin/launch/budgets')
  Future<AwsBudgetsEnvelope> listAwsBudgets({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Change the monthly limit of the prod budget (fresh 2FA step-up)
  @POST('/admin/launch/budgets/limit')
  Future<AwsBudgetsEnvelope> setAwsBudgetLimit({
    @Body() required BudgetLimitRequestDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete the obsolete «LawBid Monthly» budget (fresh 2FA step-up)
  @POST('/admin/launch/budgets/delete')
  Future<AwsBudgetsEnvelope> deleteAwsBudget({
    @Body() required BudgetDeleteRequestDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
