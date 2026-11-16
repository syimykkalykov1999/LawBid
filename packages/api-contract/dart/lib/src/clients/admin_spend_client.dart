// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/autoscale_tuning_report_envelope.dart';
import '../models/cost_mode_result_envelope.dart';
import '../models/cost_registry_report_envelope.dart';
import '../models/set_cost_mode_dto.dart';
import '../models/spend_report_envelope.dart';
import '../models/update_autoscale_tuning_dto.dart';
import '../models/update_fixed_costs_dto.dart';
import '../models/update_prices_dto.dart';

part 'admin_spend_client.g.dart';

@RestApi()
abstract class AdminSpendClient {
  factory AdminSpendClient(Dio dio, {String? baseUrl}) = _AdminSpendClient;

  /// Autoscaler numbers (SSM tuning) with labels and bounds
  @GET('/admin/spend/autoscale-tuning')
  Future<AutoscaleTuningReportEnvelope> autoscaleTuning({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Change autoscaler numbers (needs step-up)
  @PUT('/admin/spend/autoscale-tuning/{target}')
  Future<AutoscaleTuningReportEnvelope> updateAutoscaleTuning({
    @Path('target') required String target,
    @Body() required UpdateAutoscaleTuningDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Every billable item: real month cost, forecast, live Выкл/Вкл/Авто state, steps
  @GET('/admin/spend/registry')
  Future<CostRegistryReportEnvelope> registryReport({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Put one item in Выкл / Вкл / Авто (app settings and autoscale switches; needs step-up)
  @PATCH('/admin/spend/registry/{id}/mode')
  Future<CostModeResultEnvelope> setRegistryMode({
    @Path('id') required String id,
    @Body() required SetCostModeDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Money spent per service: month, forecast, free tier
  @GET('/admin/spend')
  Future<SpendReportEnvelope> spendReport({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Ask the services again (cached: AWS at most every 6 h)
  @POST('/admin/spend/refresh')
  Future<SpendReportEnvelope> refreshSpend({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Costs entered by hand: Apple, Google, insurance… (needs step-up)
  @PUT('/admin/spend/fixed-costs')
  Future<SpendReportEnvelope> setSpendFixedCosts({
    @Body() required UpdateFixedCostsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Vendor prices used for the estimate (needs step-up)
  @PUT('/admin/spend/prices')
  Future<SpendReportEnvelope> setSpendPrices({
    @Body() required UpdatePricesDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
