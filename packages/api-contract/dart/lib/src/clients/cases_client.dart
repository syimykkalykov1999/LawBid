// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/case_deleted_envelope.dart';
import '../models/case_envelope.dart';
import '../models/case_summary_list_envelope.dart';
import '../models/create_case_dto.dart';
import '../models/filter.dart';
import '../models/update_case_dto.dart';

part 'cases_client.g.dart';

@RestApi()
abstract class CasesClient {
  factory CasesClient(Dio dio, {String? baseUrl}) = _CasesClient;

  /// Publish a case (client, docs/04 §3.1-§3.4)
  @POST('/cases')
  Future<CaseEnvelope> createCase({
    @Body() required CreateCaseDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Edit an open case (client, docs/04 §3.5)
  @PATCH('/cases/{id}')
  Future<CaseEnvelope> updateCase({
    @Path('id') required String id,
    @Body() required UpdateCaseDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Soft-delete a case (client, open/archived only, docs/04 §3.5)
  @DELETE('/cases/{id}')
  Future<CaseDeletedEnvelope> deleteCase({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Close a case without choosing a bid (client, docs/04 §3.5)
  @POST('/cases/{id}/close')
  Future<CaseEnvelope> closeCase({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Restore an archived case (client, docs/04 §10.1)
  @POST('/cases/{id}/restore')
  Future<CaseEnvelope> restoreCase({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// "Still relevant" — resets the staleness timer (docs/04 §10.2)
  @POST('/cases/{id}/keep-alive')
  Future<CaseEnvelope> keepCaseAlive({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// "My cases" tabs (client, docs/04 §11.1).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/users/me/cases')
  Future<CaseSummaryListEnvelope> listMyCases({
    @Query('cursor') String? cursor,
    @Query('filter') Filter? filter = Filter.active,
    @Query('limit') int? limit = 20,
    @Extras() Map<String, dynamic>? extras,
  });
}
