// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/flag_minor_dto.dart';
import '../models/minor_action_result_envelope.dart';
import '../models/minors_list_envelope.dart';
import '../models/sms_opt_out_import_dto.dart';
import '../models/sms_opt_out_import_result_envelope.dart';

part 'admin_compliance_client.g.dart';

@RestApi()
abstract class AdminComplianceClient {
  factory AdminComplianceClient(Dio dio, {String? baseUrl}) =
      _AdminComplianceClient;

  /// Accounts flagged as minors, and accounts whose birth date is under the minimum age
  @GET('/admin/compliance/minors')
  Future<MinorsListEnvelope> minors({@Extras() Map<String, dynamic>? extras});

  /// Flag an account as a minor: sessions revoked, account suspended, contacts put on the stop-lists
  @POST('/admin/compliance/minors/{id}/flag')
  Future<MinorActionResultEnvelope> flag({
    @Path('id') required String id,
    @Body() required FlagMinorDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The flag was a mistake: restore the account
  @POST('/admin/compliance/minors/{id}/clear')
  Future<MinorActionResultEnvelope> clear({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete a flagged minor account now (anonymization). Needs a fresh 2FA step-up.
  @POST('/admin/compliance/minors/{id}/delete')
  Future<MinorActionResultEnvelope> deleteMinor({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Add numbers from Twilio’s opt-out export to the text-message stop-list. Needs a fresh 2FA step-up.
  @POST('/admin/compliance/sms/opt-outs/import')
  Future<SmsOptOutImportResultEnvelope> importOptOuts({
    @Body() required SmsOptOutImportDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
