import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/file_views/domain/file_view.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// `GET /files/:id/views` - the server side of the list.
// ignore: one_member_abstracts
abstract interface class FileViewsRemote {
  /// [since] = only rows newer than it; [cursor] = the page older than the
  /// previous one. Small pages (20); newest first.
  Future<FileViewsPage> page(
    String fileId, {
    String? cursor,
    DateTime? since,
  });
}

class ApiFileViewsRemote implements FileViewsRemote {
  ApiFileViewsRemote(Dio dio) : _c = api.FilesClient(dio);

  final api.FilesClient _c;

  /// Owner 2026-10-24: a small page keeps every request tiny.
  static const pageSize = 20;

  @override
  Future<FileViewsPage> page(
    String fileId, {
    String? cursor,
    DateTime? since,
  }) async {
    final env = await guardApiCall(
      () => _c.views(
        id: fileId,
        cursor: cursor,
        // ignore: avoid_redundant_argument_values
        limit: pageSize,
        since: since?.toUtc(),
      ),
    );
    return FileViewsPage(
      items: [
        for (final v in env.data)
          FileView(
            id: v.id,
            viewerUserId: v.viewerUserId,
            viewedAt: v.viewedAt,
            viewerName: v.viewerName,
            viewerAvatarUrl: v.viewerAvatarUrl,
            viewerRole: v.viewerRole,
            device: v.device,
            platform: v.platform,
            ipMasked: v.ip,
          ),
      ],
      nextCursor: env.meta?.nextCursor,
      syncedAt: env.meta?.syncedAt,
    );
  }
}

/// What the phone holds of one file's view list (Drift `lawbid_cache`):
/// the newest rows, the `since` cursor and the cursor for older pages.
class FileViewsStore {
  FileViewsStore(this._db, this.owner, {DateTime Function()? clock})
      : _now = clock ?? DateTime.now;

  final CacheDatabase _db;
  final String owner;
  final DateTime Function() _now;

  /// Rows kept per file (older ones are read from the server on demand).
  static const maxPerFile = CacheDatabase.fileViewsPerFile;

  /// Held rows, newest first, with the cursors; null = nothing kept.
  Future<({List<FileView> rows, DateTime? newestAt, String? olderCursor})?>
      read(String fileId) async {
    final sync = await _db.fileViewsSyncOf(owner, fileId);
    if (sync == null) return null;
    final rows = await _db.fileViewsOf(owner, fileId);
    return (
      rows: [
        for (final r in rows)
          FileView.fromJson(
            Map<String, Object?>.from(jsonDecode(r.json) as Map),
          ),
      ],
      newestAt: sync.newestAt,
      olderCursor: sync.olderCursor,
    );
  }

  Future<int> count(String fileId) => _db.fileViewsCount(owner, fileId);

  /// Keeps [rows]. [newest] moves the `since` cursor; [olderCursor] (with
  /// [setOlderCursor]) is the server cursor below the oldest kept row.
  Future<void> save(
    String fileId,
    List<FileView> rows, {
    DateTime? newest,
    String? olderCursor,
    bool setOlderCursor = false,
  }) =>
      _db.putFileViews(
        owner: owner,
        fileId: fileId,
        rows: [
          for (final v in rows)
            (id: v.id, viewedAt: v.viewedAt, json: jsonEncode(v.toJson())),
        ],
        now: _now(),
        newestAt: newest,
        olderCursor: olderCursor,
        setOlderCursor: setOlderCursor,
      );

  Future<void> forget(String fileId) => _db.dropFileViews(owner, fileId);
}
