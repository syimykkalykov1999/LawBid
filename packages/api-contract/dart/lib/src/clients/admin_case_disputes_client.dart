// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/case_envelope.dart';
import '../models/resolve_case_dispute_dto.dart';

part 'admin_case_disputes_client.g.dart';

@RestApi()
abstract class AdminCaseDisputesClient {
  factory AdminCaseDisputesClient(Dio dio, {String? baseUrl}) =
      _AdminCaseDisputesClient;

  /// Resolve a case dispute: closed or back to in_progress (docs/04 §10.1)
  @POST('/admin/case-disputes/{id}/resolve')
  Future<CaseEnvelope> resolveCaseDispute({
    @Path('id') required String id,
    @Body() required ResolveCaseDisputeDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
