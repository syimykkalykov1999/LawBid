import 'package:lawbid/core/persistence/saved_json.dart';
import 'package:lawbid/features/calls/data/call_history_repository.dart';
import 'package:lawbid/features/calls/domain/call_history_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-11-04 (R-383, WhatsApp): the first page of the calls history
/// kept on the phone ([SavedJson], the same store as the chat list's
/// ChatListCache), so the «Calls» tab opens at once on the last list.
class CallHistoryCache {
  const CallHistoryCache(this._saved);

  final SavedJson _saved;

  static const _name = 'calls_history';

  /// [envelope] is the server's answer for the first page, as received.
  void save(api.CallHistoryItemListEnvelope envelope) =>
      _saved.save(_name, envelope.toJson());

  /// The saved page, or null when there is none or it cannot be read. No
  /// next cursor: the live page brings it.
  Future<CursorPage<CallHistoryEntry>?> read() async {
    final json = await _saved.read(_name);
    if (json == null) return null;
    try {
      final env = api.CallHistoryItemListEnvelope.fromJson(json);
      return CursorPage(items: [for (final d in env.data) callHistoryEntry(d)]);
    } on Object {
      return null;
    }
  }

  /// Calls hidden or cleared on this phone leave the saved copy too.
  Future<void> drop(bool Function(String id) test) async {
    final json = await _saved.read(_name);
    final data = json?['data'];
    if (json == null || data is! List) return;
    _saved.save(_name, {
      ...json,
      'data': [
        for (final row in data)
          if (row is! Map || !test('${row['id']}')) row,
      ],
    });
  }
}
