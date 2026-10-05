// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_license_envelope.dart';
import '../models/admin_verification_request_envelope.dart';
import '../models/attorney_verification_status_envelope.dart';
import '../models/copy_state_registry_dto.dart';
import '../models/copy_state_registry_result_envelope.dart';
import '../models/document_url_envelope.dart';
import '../models/license_decision_dto.dart';
import '../models/license_recheck_envelope.dart';
import '../models/registry_check_envelope.dart';
import '../models/registry_flag_item_list_envelope.dart';
import '../models/registry_test_result_envelope.dart';
import '../models/reject_request_dto.dart';
import '../models/request_info_dto.dart';
import '../models/save_state_registry_dto.dart';
import '../models/state_registries_overview_envelope.dart';
import '../models/state_registry_envelope.dart';
import '../models/status2.dart';
import '../models/suspend_attorney_dto.dart';
import '../models/test_state_registry_dto.dart';
import '../models/verification_queue_item_list_envelope.dart';

part 'admin_verification_client.g.dart';

@RestApi()
abstract class AdminVerificationClient {
  factory AdminVerificationClient(Dio dio, {String? baseUrl}) =
      _AdminVerificationClient;

  /// Verifier queue, oldest first.
  ///
  /// [status] - Default: submitted and needs_more_info.
  ///
  /// [stateCode] - Only requests with a license under review in this state.
  @GET('/admin/verification/requests')
  Future<VerificationQueueItemListEnvelope> listVerificationQueue({
    @Query('limit') int? limit = 20,
    @Query('status') Status2? status,
    @Query('stateCode') String? stateCode,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Request card
  @GET('/admin/verification/requests/{id}')
  Future<AdminVerificationRequestEnvelope> getVerificationCard({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Short-lived signed link to a document (audited view).
  ///
  /// [xJustification] - Why the data is being viewed (10–500 characters).
  @POST('/admin/verification/documents/{documentId}/url')
  Future<DocumentUrlEnvelope> getVerificationDocumentUrl({
    @Path('documentId') required String documentId,
    @Header('X-Justification') required String xJustification,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Take a submitted request into work (lock)
  @POST('/admin/verification/requests/{id}/take')
  Future<AdminVerificationRequestEnvelope> takeVerificationRequest({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Verify or reject one license of the request
  @POST('/admin/verification/requests/{id}/licenses/{licenseId}/decision')
  Future<AdminVerificationRequestEnvelope> decideVerificationLicense({
    @Path('id') required String id,
    @Path('licenseId') required String licenseId,
    @Body() required LicenseDecisionDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Approve the request (fully or partially)
  @POST('/admin/verification/requests/{id}/approve')
  Future<AdminVerificationRequestEnvelope> approveVerificationRequest({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Ask the attorney for more information
  @POST('/admin/verification/requests/{id}/request-info')
  Future<AdminVerificationRequestEnvelope> requestVerificationInfo({
    @Path('id') required String id,
    @Body() required RequestInfoDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Reject the request with a reason code
  @POST('/admin/verification/requests/{id}/reject')
  Future<AdminVerificationRequestEnvelope> rejectVerificationRequest({
    @Path('id') required String id,
    @Body() required RejectRequestDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Re-run the bar lookup or queue the license for manual review
  @POST('/admin/verification/licenses/{licenseId}/recheck')
  Future<LicenseRecheckEnvelope> recheckLicense({
    @Path('licenseId') required String licenseId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Verified licenses the state registry disagreed with
  @GET('/admin/verification/registry-flags')
  Future<RegistryFlagItemListEnvelope> listRegistryFlags({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Look the license up in its state's registry now (no status change)
  @POST('/admin/verification/licenses/{licenseId}/registry-check')
  Future<RegistryCheckEnvelope> checkLicenseInRegistry({
    @Path('licenseId') required String licenseId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Keep the license; remove its registry flag
  @POST('/admin/verification/licenses/{licenseId}/registry-flag/clear')
  Future<AdminLicenseEnvelope> clearRegistryFlag({
    @Path('licenseId') required String licenseId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Suspend an attorney (hidden from search, active bids withdrawn).
  ///
  /// [attorneyId] - Attorney user id.
  @POST('/admin/verification/attorneys/{attorneyId}/suspend')
  Future<AttorneyVerificationStatusEnvelope> suspendAttorney({
    @Path('attorneyId') required String attorneyId,
    @Body() required SuspendAttorneyDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Restore a suspended attorney.
  ///
  /// [attorneyId] - Attorney user id.
  @POST('/admin/verification/attorneys/{attorneyId}/restore')
  Future<AttorneyVerificationStatusEnvelope> restoreAttorney({
    @Path('attorneyId') required String attorneyId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Every state with its registry settings
  @GET('/admin/verification/registries')
  Future<StateRegistriesOverviewEnvelope> listStateRegistries({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Save a state's registry (needs step-up)
  @PUT('/admin/verification/registries/{stateCode}')
  Future<StateRegistryEnvelope> saveStateRegistry({
    @Path('stateCode') required String stateCode,
    @Body() required SaveStateRegistryDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Look up a sample bar number with the saved settings
  @POST('/admin/verification/registries/{stateCode}/test')
  Future<RegistryTestResultEnvelope> testStateRegistry({
    @Path('stateCode') required String stateCode,
    @Body() required TestStateRegistryDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Copy a state's registry and key to other states (needs step-up)
  @POST('/admin/verification/registries/{stateCode}/copy')
  Future<CopyStateRegistryResultEnvelope> copyStateRegistry({
    @Path('stateCode') required String stateCode,
    @Body() required CopyStateRegistryDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
