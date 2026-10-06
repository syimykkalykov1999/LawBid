// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/accept_legal_documents_dto.dart';
import '../models/create_dmca_notice_dto.dart';
import '../models/dmca_agent_envelope.dart';
import '../models/dmca_counter_notice_dto.dart';
import '../models/dmca_mine_envelope.dart';
import '../models/dmca_notice_brief_envelope.dart';
import '../models/dmca_notice_created_envelope.dart';
import '../models/legal_document_brief_list_envelope.dart';
import '../models/legal_document_public_envelope.dart';
import '../models/legal_public_envelope.dart';
import '../models/locale.dart';
import '../models/pending_legal_document_list_envelope.dart';
import '../models/type3.dart';

part 'legal_client.g.dart';

@RestApi()
abstract class LegalClient {
  factory LegalClient(Dio dio, {String? baseUrl}) = _LegalClient;

  /// Legal texts in my language (case form, unverified attorney, support, partner disclosure and rules), the DMCA agent and the partner rules version
  @GET('/legal/settings')
  Future<LegalPublicEnvelope> getLegalSettings({
    @Extras() Map<String, dynamic>? extras,
  });

  /// The designated DMCA agent (public, for the website; empty until registered)
  @GET('/legal/dmca-agent')
  Future<DmcaAgentEnvelope> getDmcaAgent({
    @Extras() Map<String, dynamic>? extras,
  });

  /// File a DMCA takedown notice (a target on LawBid or a URL); with a target a `copyright` report is filed too
  @POST('/legal/dmca')
  Future<DmcaNoticeCreatedEnvelope> createDmcaNotice({
    @Body() required CreateDmcaNoticeDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My DMCA notices and the notices against my content
  @GET('/legal/dmca/mine')
  Future<DmcaMineEnvelope> getMyDmcaNotices({
    @Extras() Map<String, dynamic>? extras,
  });

  /// File a counter-notice (17 U.S.C. §512(g)) — only the author of the removed content
  @POST('/legal/dmca/{id}/counter')
  Future<DmcaNoticeBriefEnvelope> counterDmcaNotice({
    @Path('id') required String id,
    @Body() required DmcaCounterNoticeDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Every current legal document (type, language, version, date; public, for the website and the app)
  @GET('/legal/documents')
  Future<LegalDocumentBriefListEnvelope> listCurrentLegalDocuments({
    @Extras() Map<String, dynamic>? extras,
  });

  /// The current text of one legal document in Markdown (public); English when there is no text in the language.
  ///
  /// [locale] - Falls back to English when there is no text in this language.
  @GET('/legal/documents/{type}')
  Future<LegalDocumentPublicEnvelope> getCurrentLegalDocument({
    @Path('type') required Type3 type,
    @Query('locale') Locale? locale,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Legal documents of my role that I have not accepted at the current version
  @GET('/legal/pending')
  Future<PendingLegalDocumentListEnvelope> getPendingLegalDocuments({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Accept the current versions the user ticked (an append-only consent with document, IP and device); returns what is still pending
  @POST('/legal/accept')
  Future<PendingLegalDocumentListEnvelope> acceptLegalDocuments({
    @Body() required AcceptLegalDocumentsDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
