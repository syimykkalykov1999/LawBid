// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/age_gate_config_envelope.dart';
import '../models/sms_consent_request_dto.dart';
import '../models/sms_consent_result_envelope.dart';
import '../models/sms_disclosure_envelope.dart';

part 'compliance_client.g.dart';

@RestApi()
abstract class ComplianceClient {
  factory ComplianceClient(Dio dio, {String? baseUrl}) = _ComplianceClient;

  /// Sign-up age gate: mode, minimum age, wording version
  @GET('/compliance/age-gate')
  Future<AgeGateConfigEnvelope> ageGateConfig({
    @Extras() Map<String, dynamic>? extras,
  });

  /// The wording shown next to the text-message consent
  @GET('/compliance/sms-consent/disclosure')
  Future<SmsDisclosureEnvelope> disclosure({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Record separate consent to get text messages (not needed for sign-in codes)
  @POST('/compliance/sms-consent')
  Future<SmsConsentResultEnvelope> consent({
    @Body() required SmsConsentRequestDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Withdraw consent to text messages
  @DELETE('/compliance/sms-consent')
  Future<SmsConsentResultEnvelope> revoke({
    @Extras() Map<String, dynamic>? extras,
  });
}
