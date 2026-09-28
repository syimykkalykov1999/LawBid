// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/add_license_dto.dart';
import '../models/attach_document_dto.dart';
import '../models/submit_verification_request_dto.dart';
import '../models/update_verification_request_dto.dart';
import '../models/verification_overview_envelope.dart';
import '../models/verification_request_envelope.dart';

part 'verification_client.g.dart';

@RestApi()
abstract class VerificationClient {
  factory VerificationClient(Dio dio, {String? baseUrl}) = _VerificationClient;

  /// Verification status, latest request and submission budget
  @GET('/verification/me')
  Future<VerificationOverviewEnvelope> getVerificationOverview({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Create a draft verification request
  @POST('/verification/requests')
  Future<VerificationRequestEnvelope> createVerificationRequest({
    @Extras() Map<String, dynamic>? extras,
  });

  /// One own verification request
  @GET('/verification/requests/{id}')
  Future<VerificationRequestEnvelope> getVerificationRequest({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Set the comment for the verifier (≤500)
  @PATCH('/verification/requests/{id}')
  Future<VerificationRequestEnvelope> updateVerificationRequest({
    @Path('id') required String id,
    @Body() required UpdateVerificationRequestDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Add a state license (state + bar number)
  @POST('/verification/requests/{id}/licenses')
  Future<VerificationRequestEnvelope> addVerificationLicense({
    @Path('id') required String id,
    @Body() required AddLicenseDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Remove a license added to this request
  @DELETE('/verification/requests/{id}/licenses/{licenseId}')
  Future<VerificationRequestEnvelope> removeVerificationLicense({
    @Path('id') required String id,
    @Path('licenseId') required String licenseId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Attach a clean uploaded file (bar license per state, identity document side, selfie)
  @POST('/verification/requests/{id}/documents')
  Future<VerificationRequestEnvelope> attachVerificationDocument({
    @Path('id') required String id,
    @Body() required AttachDocumentDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Remove a document from a draft
  @DELETE('/verification/requests/{id}/documents/{documentId}')
  Future<VerificationRequestEnvelope> removeVerificationDocument({
    @Path('id') required String id,
    @Path('documentId') required String documentId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Submit a draft, or resubmit after needs_more_info (answer of the attorney)
  @POST('/verification/requests/{id}/submit')
  Future<VerificationRequestEnvelope> submitVerificationRequest({
    @Path('id') required String id,
    @Body() required SubmitVerificationRequestDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
