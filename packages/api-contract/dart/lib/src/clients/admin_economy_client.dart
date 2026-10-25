// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/economy_report_envelope.dart';
import '../models/increase_capacity_dto.dart';
import '../models/update_economy_dto.dart';

part 'admin_economy_client.g.dart';

@RestApi()
abstract class AdminEconomyClient {
  factory AdminEconomyClient(Dio dio, {String? baseUrl}) = _AdminEconomyClient;

  /// Revenue vs third-party spend, ceiling, tiers
  @GET('/admin/economy')
  Future<EconomyReportEnvelope> getEconomy({
    @Extras() Map<String, dynamic>? extras,
  });

  /// The spend rule, ceiling mode, unit prices, flag
  @PATCH('/admin/economy/settings')
  Future<EconomyReportEnvelope> updateEconomySettings({
    @Body() required UpdateEconomyDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Database or Redis one tier up (needs step-up)
  @POST('/admin/economy/increase')
  Future<EconomyReportEnvelope> increaseCapacity({
    @Body() required IncreaseCapacityDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Database or Redis one tier down, only when the load is low (needs step-up)
  @POST('/admin/economy/decrease')
  Future<EconomyReportEnvelope> decreaseCapacity({
    @Body() required IncreaseCapacityDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
