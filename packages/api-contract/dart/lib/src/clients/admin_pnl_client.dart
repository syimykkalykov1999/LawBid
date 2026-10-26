// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/pnl_report_envelope.dart';

part 'admin_pnl_client.g.dart';

@RestApi()
abstract class AdminPnlClient {
  factory AdminPnlClient(Dio dio, {String? baseUrl}) = _AdminPnlClient;

  /// Profit and loss from the daily snapshot
  @GET('/admin/pnl')
  Future<PnlReportEnvelope> pnlReport({@Extras() Map<String, dynamic>? extras});

  /// Recount now (max once per 10 min)
  @POST('/admin/pnl/refresh')
  Future<PnlReportEnvelope> pnlRefresh({
    @Extras() Map<String, dynamic>? extras,
  });
}
