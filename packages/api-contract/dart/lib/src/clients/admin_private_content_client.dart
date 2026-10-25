// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/private_calls_envelope.dart';
import '../models/private_case_files_envelope.dart';
import '../models/private_file_url_envelope.dart';
import '../models/private_messages_page_envelope.dart';
import '../models/revealed_message_envelope.dart';

part 'admin_private_content_client.g.dart';

@RestApi()
abstract class AdminPrivateContentClient {
  factory AdminPrivateContentClient(Dio dio, {String? baseUrl}) =
      _AdminPrivateContentClient;

  /// Messages of one conversation WITHOUT their text (audited, reason code + text).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  ///
  /// [xReasonCode] - One of: report_review, imminent_harm, legal_process, tech_fix_consent.
  ///
  /// [xJustification] - Free-text reason (10–500 characters).
  @GET('/admin/private-content/conversations/{id}/messages')
  Future<PrivateMessagesPageEnvelope> listPrivateMessages({
    @Path('id') required String id,
    @Header('X-Reason-Code') required String xReasonCode,
    @Header('X-Justification') required String xJustification,
    @Query('limit') num? limit = 50,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Reveal ONE message text: reason code + text + a fresh authenticator code.
  ///
  /// [xReasonCode] - One of: report_review, imminent_harm, legal_process, tech_fix_consent.
  ///
  /// [xJustification] - Free-text reason (10–500 characters).
  @POST('/admin/private-content/messages/{id}/reveal')
  Future<RevealedMessageEnvelope> revealPrivateMessage({
    @Path('id') required String id,
    @Header('X-Reason-Code') required String xReasonCode,
    @Header('X-Justification') required String xJustification,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Call metadata of one conversation (audited).
  ///
  /// [xReasonCode] - One of: report_review, imminent_harm, legal_process, tech_fix_consent.
  ///
  /// [xJustification] - Free-text reason (10–500 characters).
  @GET('/admin/private-content/conversations/{id}/calls')
  Future<PrivateCallsEnvelope> listPrivateCalls({
    @Path('id') required String id,
    @Header('X-Reason-Code') required String xReasonCode,
    @Header('X-Justification') required String xJustification,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Files of one case, metadata only (audited).
  ///
  /// [xReasonCode] - One of: report_review, imminent_harm, legal_process, tech_fix_consent.
  ///
  /// [xJustification] - Free-text reason (10–500 characters).
  @GET('/admin/private-content/cases/{id}/files')
  Future<PrivateCaseFilesEnvelope> listPrivateCaseFiles({
    @Path('id') required String id,
    @Header('X-Reason-Code') required String xReasonCode,
    @Header('X-Justification') required String xJustification,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Short-lived link to one case file: reason code + text + a fresh authenticator code.
  ///
  /// [xReasonCode] - One of: report_review, imminent_harm, legal_process, tech_fix_consent.
  ///
  /// [xJustification] - Free-text reason (10–500 characters).
  @POST('/admin/private-content/cases/{id}/files/{fileId}/url')
  Future<PrivateFileUrlEnvelope> privateCaseFileUrl({
    @Path('id') required String id,
    @Path('fileId') required String fileId,
    @Header('X-Reason-Code') required String xReasonCode,
    @Header('X-Justification') required String xJustification,
    @Extras() Map<String, dynamic>? extras,
  });
}
