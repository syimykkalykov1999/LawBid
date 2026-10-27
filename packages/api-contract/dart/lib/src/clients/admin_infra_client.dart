// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/create_infra_request_dto.dart';
import '../models/infra_overview_envelope.dart';
import '../models/infra_request_envelope.dart';

part 'admin_infra_client.g.dart';

@RestApi()
abstract class AdminInfraClient {
  factory AdminInfraClient(Dio dio, {String? baseUrl}) = _AdminInfraClient;

  /// Cloud switches: guards, recent requests and «пора включить» suggestions
  @GET('/admin/infra')
  Future<InfraOverviewEnvelope> infraOverview({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Ask to switch one cloud item (starts the GitHub plan; nothing changes yet)
  @POST('/admin/infra/requests')
  Future<InfraRequestEnvelope> createInfraRequest({
    @Body() required CreateInfraRequestDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Apply the shown plan (needs a fresh 2FA code)
  @POST('/admin/infra/requests/{id}/confirm')
  Future<InfraRequestEnvelope> confirmInfraRequest({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Throw away a request that is not applied yet
  @POST('/admin/infra/requests/{id}/cancel')
  Future<InfraRequestEnvelope> cancelInfraRequest({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// «Откатить»: a new request back to the previous position
  @POST('/admin/infra/requests/{id}/rollback')
  Future<InfraRequestEnvelope> rollbackInfraRequest({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
