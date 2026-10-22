import 'package:lawbid/core/persistence/saved_json.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-22 (client economy plan, package B): the first page of my
/// groups kept on the phone ([SavedJson]), so the inbox opens on it at once
/// and only the changes since are asked for (`updatedSince`).
class GroupListCache {
  const GroupListCache(this._saved);

  final SavedJson _saved;

  static const _name = 'groups';

  void save(List<api.GroupDto> items) => _saved.save(_name, {
        'data': [for (final g in items) g.toJson()],
      });

  /// The saved page, or null when there is none or it cannot be read.
  Future<CursorPage<api.GroupDto>?> read() async {
    final json = await _saved.read(_name);
    if (json == null) return null;
    try {
      final data = json['data'];
      if (data is! List) return null;
      return CursorPage(
        items: [
          for (final g in data)
            api.GroupDto.fromJson(Map<String, Object?>.from(g as Map)),
        ],
      );
    } on Object {
      return null;
    }
  }
}
