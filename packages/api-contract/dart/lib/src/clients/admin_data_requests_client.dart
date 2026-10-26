// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/create_data_request_dto.dart';
import '../models/create_legal_export_dto.dart';
import '../models/create_legal_hold_dto.dart';
import '../models/custody_entry_list_envelope.dart';
import '../models/data_package_envelope.dart';
import '../models/data_request_card_envelope.dart';
import '../models/data_request_envelope.dart';
import '../models/data_request_list_envelope.dart';
import '../models/erasure_record_envelope.dart';
import '../models/legal_account_card_envelope.dart';
import '../models/legal_download_envelope.dart';
import '../models/legal_export_envelope.dart';
import '../models/legal_export_list_envelope.dart';
import '../models/legal_hold_envelope.dart';
import '../models/legal_hold_list_envelope.dart';
import '../models/legal_lookup_hit_list_envelope.dart';
import '../models/prepare_package_dto.dart';
import '../models/transparency_report_envelope.dart';
import '../models/update_data_request_intake_dto.dart';
import '../models/update_data_request_status_dto.dart';
import '../models/user_notice_envelope.dart';

part 'admin_data_requests_client.g.dart';

@RestApi()
abstract class AdminDataRequestsClient {
  factory AdminDataRequestsClient(Dio dio, {String? baseUrl}) =
      _AdminDataRequestsClient;

  /// Registry of government requests, newest first.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/admin/data-requests')
  Future<DataRequestListEnvelope> listDataRequests({
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Register a subpoena / court order
  @POST('/admin/data-requests')
  Future<DataRequestEnvelope> createDataRequest({
    @Body() required CreateDataRequestDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Request with its data_access_log
  @GET('/admin/data-requests/{id}')
  Future<DataRequestCardEnvelope> getDataRequest({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// received → in_progress → fulfilled | rejected
  @PATCH('/admin/data-requests/{id}/status')
  Future<DataRequestEnvelope> setDataRequestStatus({
    @Path('id') required String id,
    @Body() required UpdateDataRequestStatusDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Prepare the data package within the scope (X-Justification; every entity → data_access_log).
  ///
  /// [xJustification] - Why the data is being viewed (10–500 characters).
  @POST('/admin/data-requests/{id}/package')
  Future<DataPackageEnvelope> prepareDataPackage({
    @Path('id') required String id,
    @Header('X-Justification') required String xJustification,
    @Body() required PreparePackageDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Find an account: phone, e-mail, @username, name, id.
  ///
  /// [q] - Phone, e-mail, @username, name or user id.
  ///
  /// [xJustification] - Why the data is being viewed (10–500 characters).
  @GET('/admin/data-requests/legal/lookup')
  Future<LegalLookupHitListEnvelope> find({
    @Query('q') required String q,
    @Header('X-Justification') required String xJustification,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Account card: profile, handles, chats, groups, devices.
  ///
  /// [xJustification] - Why the data is being viewed (10–500 characters).
  @GET('/admin/data-requests/legal/users/{userId}')
  Future<LegalAccountCardEnvelope> account({
    @Path('userId') required String userId,
    @Header('X-Justification') required String xJustification,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Account erasure record and certificate (per-store results).
  ///
  /// [xJustification] - Why the data is being viewed (10–500 characters).
  @GET('/admin/data-requests/legal/erasure/{userId}')
  Future<ErasureRecordEnvelope> erasureRecord({
    @Path('userId') required String userId,
    @Header('X-Justification') required String xJustification,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Archives of a request, newest first
  @GET('/admin/data-requests/legal/requests/{requestId}/exports')
  Future<LegalExportListEnvelope> listExports({
    @Path('requestId') required String requestId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Queue an evidence archive (step-up; the worker builds it).
  ///
  /// [xJustification] - Why the data is being viewed (10–500 characters).
  @POST('/admin/data-requests/legal/requests/{requestId}/exports')
  Future<LegalExportEnvelope> queueExport({
    @Path('requestId') required String requestId,
    @Header('X-Justification') required String xJustification,
    @Body() required CreateLegalExportDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Five-minute signed link to the ZIP (step-up, audited).
  ///
  /// [xJustification] - Why the data is being viewed (10–500 characters).
  @POST('/admin/data-requests/legal/exports/{exportId}/download')
  Future<LegalDownloadEnvelope> download({
    @Path('exportId') required String exportId,
    @Header('X-Justification') required String xJustification,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Legal holds of a request
  @GET('/admin/data-requests/legal/requests/{requestId}/holds')
  Future<LegalHoldListEnvelope> listHolds({
    @Path('requestId') required String requestId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Freeze a person / chat / group (step-up); stops the 90-day scrub
  @POST('/admin/data-requests/legal/requests/{requestId}/holds')
  Future<LegalHoldEnvelope> createHold({
    @Path('requestId') required String requestId,
    @Body() required CreateLegalHoldDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Release a hold (step-up)
  @DELETE('/admin/data-requests/legal/holds/{holdId}')
  Future<LegalHoldEnvelope> releaseHold({
    @Path('holdId') required String holdId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Yearly counts for the transparency report
  @GET('/admin/data-requests/legal/transparency')
  Future<TransparencyReportEnvelope> transparency({
    @Query('year') required num year,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Legal basis, due date, subject, gag order (step-up)
  @PATCH('/admin/data-requests/legal/requests/{requestId}/intake')
  Future<void> updateIntake({
    @Path('requestId') required String requestId,
    @Body() required UpdateDataRequestIntakeDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The notice text and whether it may be sent
  @GET('/admin/data-requests/legal/requests/{requestId}/user-notice')
  Future<UserNoticeEnvelope> noticePreview({
    @Path('requestId') required String requestId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// E-mail the notice to the user (step-up; refused under a gag order)
  @POST('/admin/data-requests/legal/requests/{requestId}/user-notice')
  Future<UserNoticeEnvelope> notifyUser({
    @Path('requestId') required String requestId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Chain of custody: who built / downloaded, when
  @GET('/admin/data-requests/legal/exports/{exportId}/custody')
  Future<CustodyEntryListEnvelope> custody({
    @Path('exportId') required String exportId,
    @Extras() Map<String, dynamic>? extras,
  });
}
