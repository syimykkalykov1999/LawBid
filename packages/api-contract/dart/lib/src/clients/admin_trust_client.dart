// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_trust_card_envelope.dart';
import '../models/bar_number_block_envelope.dart';
import '../models/bar_number_block_list_envelope.dart';
import '../models/block_bar_number_dto.dart';
import '../models/bulk_trust_dto.dart';
import '../models/bulk_trust_result_envelope.dart';
import '../models/cleared_by_item_list_envelope.dart';
import '../models/document_request_dto.dart';
import '../models/reason.dart';
import '../models/recompute_all_result_envelope.dart';
import '../models/staff_decision_stats_list_envelope.dart';
import '../models/status12.dart';
import '../models/status13.dart';
import '../models/trust_attorney_list_item_list_envelope.dart';
import '../models/trust_hold_dto.dart';
import '../models/trust_hold_list_item_list_envelope.dart';
import '../models/trust_note_dto.dart';
import '../models/trust_preset_dto.dart';
import '../models/trust_queue_item_list_envelope.dart';
import '../models/trust_release_dto.dart';
import '../models/trust_set_status_dto.dart';
import '../models/trust_settings_dto.dart';
import '../models/trust_settings_envelope.dart';
import '../models/trust_stats_envelope.dart';
import '../models/unblock_bar_number_dto.dart';

part 'admin_trust_client.g.dart';

@RestApi()
abstract class AdminTrustClient {
  factory AdminTrustClient(Dio dio, {String? baseUrl}) = _AdminTrustClient;

  /// What to require and the automatic actions
  @GET('/admin/trust/settings')
  Future<TrustSettingsEnvelope> getTrustSettings({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Change what to require and the automatic actions
  @PUT('/admin/trust/settings')
  Future<TrustSettingsEnvelope> updateTrustSettings({
    @Body() required TrustSettingsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Attorneys per level, holds, complaints
  @GET('/admin/trust/stats')
  Future<TrustStatsEnvelope> getTrustStats({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Attorneys whose payments or bids are paused
  @GET('/admin/trust/holds')
  Future<TrustHoldListItemListEnvelope> listTrustHolds({
    @Extras() Map<String, dynamic>? extras,
  });

  /// One attorney's trust card with history
  @GET('/admin/trust/attorneys/{attorneyId}')
  Future<AdminTrustCardEnvelope> getTrustCard({
    @Path('attorneyId') required String attorneyId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Verifier confirmed the license on the state bar's page
  @POST('/admin/trust/attorneys/{attorneyId}/confirm-license')
  Future<AdminTrustCardEnvelope> confirmTrustLicense({
    @Path('attorneyId') required String attorneyId,
    @Body() required TrustNoteDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Withdraw the staff confirmation of the license
  @POST('/admin/trust/attorneys/{attorneyId}/unconfirm-license')
  Future<AdminTrustCardEnvelope> unconfirmTrustLicense({
    @Path('attorneyId') required String attorneyId,
    @Body() required TrustNoteDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Verifier checked bar card + ID + selfie
  @POST('/admin/trust/attorneys/{attorneyId}/confirm-documents')
  Future<AdminTrustCardEnvelope> confirmTrustDocuments({
    @Path('attorneyId') required String attorneyId,
    @Body() required TrustNoteDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Verifier saw the firm's letter: the attorney works for the Stripe company
  @POST('/admin/trust/attorneys/{attorneyId}/confirm-firm-link')
  Future<AdminTrustCardEnvelope> confirmTrustFirmLink({
    @Path('attorneyId') required String attorneyId,
    @Body() required TrustNoteDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Apply a preset: off («Выключить всё»), soft, standard, strict, all («Включить всё»)
  @POST('/admin/trust/settings/preset')
  Future<TrustSettingsEnvelope> applyTrustPreset({
    @Body() required TrustPresetDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// «Галочки → Адвокаты»: every attorney with their badge status
  @GET('/admin/trust/attorneys')
  Future<TrustAttorneyListItemListEnvelope> trustAttorneys({
    @Query('status') Status12? status,
    @Query('q') String? q,
    @Query('limit') int? limit,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Set the badge status by hand (reason required, audited)
  @POST('/admin/trust/attorneys/{attorneyId}/status')
  Future<AdminTrustCardEnvelope> setTrustStatus({
    @Path('attorneyId') required String attorneyId,
    @Body() required TrustSetStatusDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Staff queue: attorneys waiting for a person, oldest first
  @GET('/admin/trust/queue')
  Future<TrustQueueItemListEnvelope> trustQueue({
    @Query('reason') Reason? reason,
    @Query('q') String? q,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Who approved whom: decisions per admin, speed, what came after
  @GET('/admin/trust/staff-decisions')
  Future<StaffDecisionStatsListEnvelope> staffDecisions({
    @Query('from') DateTime? from,
    @Query('to') DateTime? to,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Attorneys one admin cleared, and what happened since
  @GET('/admin/trust/cleared-by')
  Future<ClearedByItemListEnvelope> clearedBy({
    @Query('adminId') required String adminId,
    @Query('from') DateTime? from,
    @Query('to') DateTime? to,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Подтвердить: staff vouch; badge and payments open for good
  @POST('/admin/trust/attorneys/{attorneyId}/clear')
  Future<AdminTrustCardEnvelope> clearTrust({
    @Path('attorneyId') required String attorneyId,
    @Body() required TrustNoteDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Withdraw the staff clearance
  @POST('/admin/trust/attorneys/{attorneyId}/unclear')
  Future<AdminTrustCardEnvelope> unclearTrust({
    @Path('attorneyId') required String attorneyId,
    @Body() required TrustNoteDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Запросить ещё: ask for documents from a template
  @POST('/admin/trust/attorneys/{attorneyId}/request-documents')
  Future<AdminTrustCardEnvelope> requestTrustDocuments({
    @Path('attorneyId') required String attorneyId,
    @Body() required DocumentRequestDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Отклонить: suspend the account, withdraw bids
  @POST('/admin/trust/attorneys/{attorneyId}/reject')
  Future<AdminTrustCardEnvelope> rejectTrust({
    @Path('attorneyId') required String attorneyId,
    @Body() required TrustNoteDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Clear / request documents / reject / release many
  @POST('/admin/trust/bulk')
  Future<BulkTrustResultEnvelope> bulkTrust({
    @Body() required BulkTrustDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Pause payments and/or bids
  @POST('/admin/trust/attorneys/{attorneyId}/hold')
  Future<AdminTrustCardEnvelope> holdTrust({
    @Path('attorneyId') required String attorneyId,
    @Body() required TrustHoldDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Lift holds after review
  @POST('/admin/trust/attorneys/{attorneyId}/release')
  Future<AdminTrustCardEnvelope> releaseTrust({
    @Path('attorneyId') required String attorneyId,
    @Body() required TrustReleaseDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Recompute the level from the facts
  @POST('/admin/trust/attorneys/{attorneyId}/recompute')
  Future<AdminTrustCardEnvelope> recomputeTrust({
    @Path('attorneyId') required String attorneyId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Bar numbers that cannot register again: reason, who blocked, attempts
  @GET('/admin/trust/blocked-bar-numbers')
  Future<BarNumberBlockListEnvelope> blockedBarNumbers({
    @Query('status') Status13? status,
    @Query('q') String? q,
    @Query('limit') int? limit,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Block a bar number by hand (reason required)
  @POST('/admin/trust/blocked-bar-numbers')
  Future<BarNumberBlockEnvelope> blockBarNumber({
    @Body() required BlockBarNumberDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// One blocked bar number with its history
  @GET('/admin/trust/blocked-bar-numbers/{id}')
  Future<BarNumberBlockEnvelope> blockedBarNumber({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Lift the block (the person explained / proved); reason required
  @POST('/admin/trust/blocked-bar-numbers/{id}/unblock')
  Future<BarNumberBlockEnvelope> unblockBarNumber({
    @Path('id') required String id,
    @Body() required UnblockBarNumberDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Recompute every attorney (after a settings change)
  @POST('/admin/trust/recompute-all')
  Future<RecomputeAllResultEnvelope> recomputeAllTrust({
    @Extras() Map<String, dynamic>? extras,
  });
}
