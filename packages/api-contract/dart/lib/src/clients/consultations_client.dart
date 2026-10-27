// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/consultation_envelope.dart';
import '../models/consultation_list_envelope.dart';
import '../models/consultation_reason_dto.dart';
import '../models/consultation_settings_envelope.dart';
import '../models/consultation_slots_envelope.dart';
import '../models/create_consultation_dto.dart';
import '../models/dispute_no_show_dto.dart';
import '../models/no_show_info_envelope.dart';
import '../models/reschedule_consultation_dto.dart';
import '../models/update_consultation_settings_dto.dart';
import '../models/view.dart';

part 'consultations_client.g.dart';

@RestApi()
abstract class ConsultationsClient {
  factory ConsultationsClient(Dio dio, {String? baseUrl}) =
      _ConsultationsClient;

  /// The attorney's booking hours (attorney)
  @GET('/consultations/settings')
  Future<ConsultationSettingsEnvelope> getConsultationSettings({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Replace the booking hours (attorney)
  @PUT('/consultations/settings')
  Future<ConsultationSettingsEnvelope> updateConsultationSettings({
    @Body() required UpdateConsultationSettingsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Free slots of an attorney for the next days.
  ///
  /// [from] - First day, attorney local date. Default: today there.
  @GET('/consultations/slots')
  Future<ConsultationSlotsEnvelope> listConsultationSlots({
    @Query('attorneyId') required String attorneyId,
    @Query('days') int? days = 7,
    @Query('from') String? from,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My consultations (both roles).
  ///
  /// [updatedSince] - Owner 2026-10-22 (client economy plan, package E): only my consultations changed since (ISO); meta.deletedIds = the ones that left this view; meta.syncedAt = pass it back next time. Older than 7 days → 409 SYNC_TOO_OLD.
  @GET('/consultations')
  Future<ConsultationListEnvelope> listConsultations({
    @Query('cursor') String? cursor,
    @Query('updatedSince') DateTime? updatedSince,
    @Query('view') View? view = View.upcoming,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Book a slot (client)
  @POST('/consultations')
  Future<ConsultationEnvelope> bookConsultation({
    @Body() required CreateConsultationDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// One consultation
  @GET('/consultations/{id}')
  Future<ConsultationEnvelope> getConsultation({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Confirm a request (attorney)
  @POST('/consultations/{id}/confirm')
  Future<ConsultationEnvelope> confirmConsultation({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Decline a request (attorney)
  @POST('/consultations/{id}/decline')
  Future<ConsultationEnvelope> declineConsultation({
    @Path('id') required String id,
    @Body() required ConsultationReasonDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Cancel (either side)
  @POST('/consultations/{id}/cancel')
  Future<ConsultationEnvelope> cancelConsultation({
    @Path('id') required String id,
    @Body() required ConsultationReasonDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Move to another free slot (either side)
  @POST('/consultations/{id}/reschedule')
  Future<ConsultationEnvelope> rescheduleConsultation({
    @Path('id') required String id,
    @Body() required RescheduleConsultationDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// No-show marks of a consultation (both sides see them)
  @GET('/consultations/{id}/no-show')
  Future<NoShowInfoEnvelope> listNoShows({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Mark the other side as absent (after the grace window; they can dispute)
  @POST('/consultations/{id}/no-show')
  Future<NoShowInfoEnvelope> markNoShow({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// I was there: dispute the mark against me
  @POST('/consultations/{id}/no-show/dispute')
  Future<NoShowInfoEnvelope> disputeNoShow({
    @Path('id') required String id,
    @Body() required DisputeNoShowDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Take back my own mark
  @POST('/consultations/{id}/no-show/withdraw')
  Future<NoShowInfoEnvelope> withdrawNoShow({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
