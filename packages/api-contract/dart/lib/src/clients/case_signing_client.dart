// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/create_sign_request_dto.dart';
import '../models/decline_sign_dto.dart';
import '../models/sign_dto.dart';
import '../models/sign_request_list_envelope.dart';
import '../models/sign_verify_envelope.dart';

part 'case_signing_client.g.dart';

@RestApi()
abstract class CaseSigningClient {
  factory CaseSigningClient(Dio dio, {String? baseUrl}) = _CaseSigningClient;

  /// Documents of the case waiting for / carrying signatures
  @GET('/cases/{id}/signing')
  Future<SignRequestListEnvelope> listSignRequests({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Ask both sides to sign a PDF (uploaded as a case attachment)
  @POST('/cases/{id}/signing')
  Future<SignRequestListEnvelope> createSignRequest({
    @Path('id') required String id,
    @Body() required CreateSignRequestDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Sign with a drawn signature or the typed name; the second signature finishes the document
  @POST('/cases/{id}/signing/{requestId}/sign')
  Future<SignRequestListEnvelope> signDocument({
    @Path('id') required String id,
    @Path('requestId') required String requestId,
    @Body() required SignDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Decline to sign (with a reason)
  @POST('/cases/{id}/signing/{requestId}/decline')
  Future<SignRequestListEnvelope> declineSignRequest({
    @Path('id') required String id,
    @Path('requestId') required String requestId,
    @Body() required DeclineSignDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The side that asked withdraws the request
  @POST('/cases/{id}/signing/{requestId}/cancel')
  Future<SignRequestListEnvelope> cancelSignRequest({
    @Path('id') required String id,
    @Path('requestId') required String requestId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The side that asked reminds the one who has not signed (also revives an expired request)
  @POST('/cases/{id}/signing/{requestId}/resend')
  Future<SignRequestListEnvelope> resendSignRequest({
    @Path('id') required String id,
    @Path('requestId') required String requestId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Recompute the file hashes and the journal chain of a document
  @GET('/cases/{id}/signing/{requestId}/verify')
  Future<SignVerifyEnvelope> verifySignRequest({
    @Path('id') required String id,
    @Path('requestId') required String requestId,
    @Extras() Map<String, dynamic>? extras,
  });
}
