import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

enum DataExportStatus {
  queued,
  processing,
  ready,
  failed,
  expired,
  unknown;

  static DataExportStatus parse(String? raw) => values.firstWhere(
        (s) => s.name == raw,
        orElse: () => DataExportStatus.unknown,
      );

  bool get inProgress =>
      this == DataExportStatus.queued || this == DataExportStatus.processing;
}

/// One `data_export_jobs` row as `GET /users/me/data-export/:id` shows it
/// (docs/06 §5.2).
@immutable
class DataExport {
  const DataExport({
    required this.id,
    required this.status,
    required this.createdAt,
    this.url,
    this.expiresAt,
  });

  final String id;
  final DataExportStatus status;

  /// Signed download link while [status] is `ready` (24 hours).
  final String? url;
  final DateTime? expiresAt;
  final DateTime createdAt;
}

/// docs/06 §5.2 «Скачать мои данные». Throws [ApiException].
abstract interface class DataExportRepository {
  /// Queues the ZIP; needs a fresh reauth token (`X-Reauth-Token`).
  Future<DataExport> request(String reauthToken);
  Future<DataExport> status(String exportId);
}

class ApiDataExportRepository implements DataExportRepository {
  ApiDataExportRepository(Dio dio) : _api = api.UsersClient(dio);

  final api.UsersClient _api;

  static DataExport _map(api.DataExportJobDto d) => DataExport(
        id: d.exportId,
        status: DataExportStatus.parse(d.status.json),
        url: d.url,
        expiresAt: d.expiresAt,
        createdAt: d.createdAt,
      );

  @override
  Future<DataExport> request(String reauthToken) async => _map(
        (await guardApiCall(
          () => _api.requestDataExport(xReauthToken: reauthToken),
        ))
            .data,
      );

  @override
  Future<DataExport> status(String exportId) async => _map(
        (await guardApiCall(() => _api.getDataExport(exportId: exportId))).data,
      );
}
