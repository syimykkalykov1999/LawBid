// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_dmca_notice_detail_envelope.dart';
import '../models/admin_dmca_notice_row_envelope.dart';
import '../models/admin_dmca_notice_row_list_envelope.dart';
import '../models/dmca_decide_dto.dart';
import '../models/dmca_status.dart';
import '../models/legal_settings_dto.dart';
import '../models/legal_settings_envelope.dart';

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
}
