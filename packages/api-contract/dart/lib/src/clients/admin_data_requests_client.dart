// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/create_data_request_dto.dart';
import '../models/data_package_envelope.dart';
import '../models/data_request_card_envelope.dart';
import '../models/data_request_envelope.dart';
import '../models/data_request_list_envelope.dart';
import '../models/prepare_package_dto.dart';
import '../models/update_data_request_status_dto.dart';

part 'admin_data_requests_client.g.dart';

@RestApi()
abstract class AdminDataRequestsClient {
  factory AdminDataRequestsClient(Dio dio, {String? baseUrl}) =
      _AdminDataRequestsClient;

  /// Registry of government requests, newest first.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/admin/data-requests')
  Future<DataRequestListEnvelope> listDataRequests({
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Register a subpoena / court order
  @POST('/admin/data-requests')
  Future<DataRequestEnvelope> createDataRequest({
    @Body() required CreateDataRequestDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Request with its data_access_log
  @GET('/admin/data-requests/{id}')
  Future<DataRequestCardEnvelope> getDataRequest({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// received → in_progress → fulfilled | rejected
  @PATCH('/admin/data-requests/{id}/status')
  Future<DataRequestEnvelope> setDataRequestStatus({
    @Path('id') required String id,
    @Body() required UpdateDataRequestStatusDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Prepare the data package within the scope (X-Justification; every entity → data_access_log).
  ///
  /// [xJustification] - Why the data is being viewed (10–500 characters).
  @POST('/admin/data-requests/{id}/package')
  Future<DataPackageEnvelope> prepareDataPackage({
    @Path('id') required String id,
    @Header('X-Justification') required String xJustification,
    @Body() required PreparePackageDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
