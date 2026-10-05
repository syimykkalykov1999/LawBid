// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_trust_card_envelope.dart';
import '../models/recompute_all_result_envelope.dart';
import '../models/trust_hold_dto.dart';
import '../models/trust_hold_list_item_list_envelope.dart';
import '../models/trust_note_dto.dart';
import '../models/trust_settings_dto.dart';
import '../models/trust_settings_envelope.dart';
import '../models/trust_stats_envelope.dart';

part 'admin_trust_client.g.dart';

@RestApi()
abstract class AdminTrustClient {
  factory AdminTrustClient(Dio dio, {String? baseUrl}) = _AdminTrustClient;

  /// Gate levels and automatic actions
  @GET('/admin/trust/settings')
  Future<TrustSettingsEnvelope> getTrustSettings({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Change gate levels and automatic actions
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
    @Body() required TrustHoldDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Recompute the level from the facts
  @POST('/admin/trust/attorneys/{attorneyId}/recompute')
  Future<AdminTrustCardEnvelope> recomputeTrust({
    @Path('attorneyId') required String attorneyId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Recompute every attorney (after a settings change)
  @POST('/admin/trust/recompute-all')
  Future<RecomputeAllResultEnvelope> recomputeAllTrust({
    @Extras() Map<String, dynamic>? extras,
  });
}
