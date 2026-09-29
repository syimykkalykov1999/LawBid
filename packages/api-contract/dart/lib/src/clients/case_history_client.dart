// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/case_history_detail_envelope.dart';
import '../models/case_history_export_envelope.dart';
import '../models/case_history_item_list_envelope.dart';

part 'case_history_client.g.dart';

@RestApi()
abstract class CaseHistoryClient {
  factory CaseHistoryClient(Dio dio, {String? baseUrl}) = _CaseHistoryClient;

  /// Case history list (docs/04 §12).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  ///
  /// [xReauthToken] - reauthToken from POST /auth/reauth (5 minutes).
  @GET('/users/me/case-history')
  Future<CaseHistoryItemListEnvelope> listCaseHistory({
    @Header('X-Reauth-Token') required String xReauthToken,
    @Query('limit') num? limit = 20,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Queue the case history PDF (docs/04 §12).
  ///
  /// [xReauthToken] - reauthToken from POST /auth/reauth (5 minutes).
  @POST('/users/me/case-history/export')
  Future<CaseHistoryExportEnvelope> exportCaseHistory({
    @Header('X-Reauth-Token') required String xReauthToken,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Export status; when ready, a 10-minute signed PDF link (consumes the reauth token).
  ///
  /// [xReauthToken] - reauthToken from POST /auth/reauth (5 minutes).
  @GET('/users/me/case-history/export/{exportId}')
  Future<CaseHistoryExportEnvelope> getCaseHistoryExport({
    @Path('exportId') required String exportId,
    @Header('X-Reauth-Token') required String xReauthToken,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Case timeline from case_journal (docs/04 §12).
  ///
  /// [xReauthToken] - reauthToken from POST /auth/reauth (5 minutes).
  @GET('/users/me/case-history/{caseId}')
  Future<CaseHistoryDetailEnvelope> getCaseHistory({
    @Path('caseId') required String caseId,
    @Header('X-Reauth-Token') required String xReauthToken,
    @Extras() Map<String, dynamic>? extras,
  });
}
