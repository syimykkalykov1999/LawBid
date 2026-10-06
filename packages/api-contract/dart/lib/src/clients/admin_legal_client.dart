// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_dmca_notice_detail_envelope.dart';
import '../models/admin_dmca_notice_row_envelope.dart';
import '../models/admin_dmca_notice_row_list_envelope.dart';
import '../models/admin_legal_document_detail_envelope.dart';
import '../models/admin_legal_document_row_list_envelope.dart';
import '../models/admin_legal_version_envelope.dart';
import '../models/admin_legal_version_list_envelope.dart';
import '../models/dmca_decide_dto.dart';
import '../models/dmca_status.dart';
import '../models/legal_settings_dto.dart';
import '../models/legal_settings_envelope.dart';
import '../models/locale.dart';
import '../models/publish_legal_dto.dart';
import '../models/save_legal_draft_dto.dart';
import '../models/type3.dart';

part 'admin_legal_client.g.dart';

@RestApi()
abstract class AdminLegalClient {
  factory AdminLegalClient(Dio dio, {String? baseUrl}) = _AdminLegalClient;

  /// DMCA agent, incident contact, strikes threshold and the legal texts (en/ru)
  @GET('/admin/legal/settings')
  Future<LegalSettingsEnvelope> getAdminLegalSettings({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Replace the legal settings (audited)
  @PUT('/admin/legal/settings')
  Future<LegalSettingsEnvelope> updateAdminLegalSettings({
    @Body() required LegalSettingsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// DMCA notices, newest first (50 per page)
  @GET('/admin/legal/dmca')
  Future<AdminDmcaNoticeRowListEnvelope> listAdminDmcaNotices({
    @Query('status') DmcaStatus? status,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// One notice with the moderation card of its target and the author strikes
  @GET('/admin/legal/dmca/{id}')
  Future<AdminDmcaNoticeDetailEnvelope> getAdminDmcaNotice({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// remove (takes the content down, a strike for the author, suspension at the threshold) / reject / restore (after a counter-notice; the strike goes back)
  @POST('/admin/legal/dmca/{id}/decide')
  Future<AdminDmcaNoticeRowEnvelope> decideAdminDmcaNotice({
    @Path('id') required String id,
    @Body() required DmcaDecideDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Every legal document by type with the state of each language
  @GET('/admin/legal/documents')
  Future<AdminLegalDocumentRowListEnvelope> listAdminLegalDocuments({
    @Extras() Map<String, dynamic>? extras,
  });

  /// One version with the full text
  @GET('/admin/legal/documents/version/{id}')
  Future<AdminLegalVersionEnvelope> getAdminLegalVersion({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Rollback (super admin): publish an old version’s text as a new version; nothing is deleted
  @POST('/admin/legal/documents/version/{id}/rollback')
  Future<AdminLegalVersionEnvelope> rollbackAdminLegalVersion({
    @Path('id') required String id,
    @Body() required PublishLegalDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Current version and draft of both languages, with the texts
  @GET('/admin/legal/documents/{type}')
  Future<AdminLegalDocumentDetailEnvelope> getAdminLegalDocument({
    @Path('type') required Type3 type,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Published and archived versions, newest first (no texts)
  @GET('/admin/legal/documents/{type}/{locale}/history')
  Future<AdminLegalVersionListEnvelope> getAdminLegalHistory({
    @Path('type') required Type3 type,
    @Path('locale') required Locale locale,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Create or replace the draft (Markdown)
  @PUT('/admin/legal/documents/{type}/{locale}/draft')
  Future<AdminLegalVersionEnvelope> saveAdminLegalDraft({
    @Path('type') required Type3 type,
    @Path('locale') required Locale locale,
    @Body() required SaveLegalDraftDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Throw the draft away (published versions stay)
  @DELETE('/admin/legal/documents/{type}/{locale}/draft')
  Future<void> discardAdminLegalDraft({
    @Path('type') required Type3 type,
    @Path('locale') required Locale locale,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Publish the draft (super admin): next version number, the previous one is archived; optionally asks users to accept again
  @POST('/admin/legal/documents/{type}/{locale}/publish')
  Future<AdminLegalVersionEnvelope> publishAdminLegalDocument({
    @Path('type') required Type3 type,
    @Path('locale') required Locale locale,
    @Body() required PublishLegalDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
