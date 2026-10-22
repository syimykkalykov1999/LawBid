// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/csam_report_envelope.dart';
import '../models/media_check_envelope.dart';
import '../models/media_check_list_status.dart';
import '../models/media_check_page_envelope.dart';
import '../models/media_decision_dto.dart';

part 'admin_media_moderation_client.g.dart';

@RestApi()
abstract class AdminMediaModerationClient {
  factory AdminMediaModerationClient(Dio dio, {String? baseUrl}) =
      _AdminMediaModerationClient;

  /// Flagged / hidden / CSAM / unchecked pictures.
  ///
  /// [cursor] - created_at of the last row seen.
  @GET('/admin/media-moderation')
  Future<MediaCheckPageEnvelope> listMediaChecks({
    @Query('limit') num? limit = 30,
    @Query('status') MediaCheckListStatus? status,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// approve (restore what was hidden) or remove
  @POST('/admin/media-moderation/{id}/decision')
  Future<MediaCheckEnvelope> decideMediaCheck({
    @Path('id') required String id,
    @Body() required MediaDecisionDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Hide everywhere, keep the evidence and open an NCMEC CyberTipline report
  @POST('/admin/media-moderation/{id}/csam-report')
  Future<CsamReportEnvelope> reportMediaCheckCsam({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
