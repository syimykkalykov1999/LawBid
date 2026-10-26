import 'package:flutter/foundation.dart';

/// Owner 2026-10-24 («Просмотры» of a case document): one time somebody
/// other than the owner was given a link to the file. The address arrives
/// already masked (`203.0.113.x`); the full one never reaches the phone.
@immutable
class FileView {
  const FileView({
    required this.id,
    required this.viewerUserId,
    required this.viewedAt,
    this.viewerName,
    this.viewerAvatarUrl,
    this.viewerRole,
    this.device,
    this.platform,
    this.ipMasked,
  });

  factory FileView.fromJson(Map<String, Object?> j) => FileView(
        id: j['id']! as String,
        viewerUserId: j['viewerUserId']! as String,
        viewedAt: DateTime.parse(j['viewedAt']! as String),
        viewerName: j['viewerName'] as String?,
        viewerAvatarUrl: j['viewerAvatarUrl'] as String?,
        viewerRole: j['viewerRole'] as String?,
        device: j['device'] as String?,
        platform: j['platform'] as String?,
        ipMasked: j['ipMasked'] as String?,
      );

  final String id;
  final String viewerUserId;
  final DateTime viewedAt;
  final String? viewerName;

  /// A signed link: it expires, so it is not trusted past a day on disk.
  final String? viewerAvatarUrl;

  /// `client` / `attorney` / `assistant`.
  final String? viewerRole;
  final String? device;
  final String? platform;
  final String? ipMasked;

  Map<String, Object?> toJson() => {
        'id': id,
        'viewerUserId': viewerUserId,
        'viewedAt': viewedAt.toUtc().toIso8601String(),
        'viewerName': viewerName,
        'viewerAvatarUrl': viewerAvatarUrl,
        'viewerRole': viewerRole,
        'device': device,
        'platform': platform,
        'ipMasked': ipMasked,
      };
}

/// What one request for a file's view list answers.
@immutable
class FileViewsPage {
  const FileViewsPage({
    required this.items,
    this.nextCursor,
    this.syncedAt,
  });

  final List<FileView> items;
  final String? nextCursor;
  final DateTime? syncedAt;
}

/// Newest first; same time → higher id first (the server's order).
int compareFileViews(FileView a, FileView b) {
  final c = b.viewedAt.compareTo(a.viewedAt);
  return c != 0 ? c : b.id.compareTo(a.id);
}
