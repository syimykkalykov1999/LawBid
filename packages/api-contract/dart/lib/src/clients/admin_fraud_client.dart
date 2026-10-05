// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/fraud_ban_dto.dart';
import '../models/fraud_ban_result_envelope.dart';
import '../models/fraud_card_envelope.dart';
import '../models/fraud_event_list_envelope.dart';
import '../models/fraud_events_actor_filter.dart';
import '../models/fraud_note_dto.dart';
import '../models/fraud_preset_dto.dart';
import '../models/fraud_queue_filter.dart';
import '../models/fraud_queue_item_list_envelope.dart';
import '../models/fraud_reason_dto.dart';
import '../models/fraud_recompute_all_result_envelope.dart';
import '../models/fraud_settings_dto.dart';
import '../models/fraud_settings_envelope.dart';
import '../models/fraud_stats_envelope.dart';

part 'admin_fraud_client.g.dart';

@RestApi()
abstract class AdminFraudClient {
  factory AdminFraudClient(Dio dio, {String? baseUrl}) = _AdminFraudClient;

  /// Repeat-account rules and score thresholds
  @GET('/admin/fraud/settings')
  Future<FraudSettingsEnvelope> getFraudSettings({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Change the rules and thresholds
  @PUT('/admin/fraud/settings')
  Future<FraudSettingsEnvelope> updateFraudSettings({
    @Body() required FraudSettingsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Выключить / Мягко / Стандарт / Строго
  @POST('/admin/fraud/settings/preset')
  Future<FraudSettingsEnvelope> applyFraudPreset({
    @Body() required FraudPresetDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Queue, restricted, blocked, refused sign-ins
  @GET('/admin/fraud/stats')
  Future<FraudStatsEnvelope> getFraudStats({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Accounts waiting for a check, highest score first.
  ///
  /// [status] - Default 'queue' = review + restricted.
  ///
  /// [q] - Name, e-mail, phone or user id.
  @GET('/admin/fraud/queue')
  Future<FraudQueueItemListEnvelope> listFraudQueue({
    @Query('status') FraudQueueFilter? status,
    @Query('q') String? q,
    @Query('limit') num? limit,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Decision history (staff or automatic)
  @GET('/admin/fraud/events')
  Future<FraudEventListEnvelope> listFraudEvents({
    @Query('actor') FraudEventsActorFilter? actor,
    @Query('limit') num? limit,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Re-score every client active in the last year
  @POST('/admin/fraud/recompute-all')
  Future<FraudRecomputeAllResultEnvelope> recomputeAllFraud({
    @Extras() Map<String, dynamic>? extras,
  });

  /// One account: score, linked accounts, history
  @GET('/admin/fraud/users/{userId}')
  Future<FraudCardEnvelope> getFraudCard({
    @Path('userId') required String userId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// «Снять»: checked, nothing wrong (restores a block)
  @POST('/admin/fraud/users/{userId}/clear')
  Future<FraudCardEnvelope> clearFraud({
    @Path('userId') required String userId,
    @Body() required FraudNoteDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// «Ограничить»: no cases, no messages to attorneys
  @POST('/admin/fraud/users/{userId}/restrict')
  Future<FraudCardEnvelope> restrictFraud({
    @Path('userId') required String userId,
    @Body() required FraudReasonDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// «Заблокировать» (optionally every linked account)
  @POST('/admin/fraud/users/{userId}/ban')
  Future<FraudBanResultEnvelope> banFraud({
    @Path('userId') required String userId,
    @Body() required FraudBanDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Re-score one account now
  @POST('/admin/fraud/users/{userId}/recompute')
  Future<FraudCardEnvelope> recomputeFraud({
    @Path('userId') required String userId,
    @Extras() Map<String, dynamic>? extras,
  });
}
