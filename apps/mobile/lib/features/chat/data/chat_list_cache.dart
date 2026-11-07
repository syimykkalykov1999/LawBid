import 'package:lawbid/core/persistence/saved_json.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-20 (speed, Telegram): the first page of the chat list
/// ("All" folder, no search) kept on the phone ([SavedJson]), so the inbox
/// opens at once on the last list and the live one replaces it in the
/// background.
///
/// R-404 (owner 2026-11-04, the Cases cards seen for a frame under the
/// chats): the same page is also held in MEMORY once read, so the chats
/// screen draws its rows in its very first frame — a disk read, however
/// fast, always lands one frame late (Telegram keeps its dialogs in
/// memory for the same reason). [warm] fills it ahead of the first open.
class ChatListCache {
  ChatListCache(this._saved);

  final SavedJson _saved;

  static const _name = 'chats';

  CursorPage<Conversation>? _memory;
  Future<void>? _warming;

  /// The rows a chats screen may draw synchronously, newest copy first:
  /// the live list's last rows ([remember]), else the saved page.
  CursorPage<Conversation>? get memory => _memory;

  /// [envelope] is the server's answer for the first page, as received.
  void save(api.ConversationListEnvelope envelope) {
    _saved.save(_name, envelope.toJson());
    try {
      _memory = CursorPage(
        items: envelope.data.map(ChatMappers.conversation).toList(),
      );
    } on Object {
      // A row the mapper cannot read: the memory copy stays as it was.
    }
  }

  /// The live list's rows as they are now (a socket event moved one): the
  /// next open shows them, not the older saved page.
  void remember(List<Conversation> items) {
    if (items.isEmpty) return;
    _memory = CursorPage(items: List.unmodifiable(items));
  }

  /// Reads the saved page into memory once (before the chats screen is
  /// first shown). Repeated calls share one read.
  Future<void> warm() => _warming ??= read().then((_) {});

  /// The saved page, or null when there is none or it cannot be read.
  /// No next cursor: the live page brings it.
  Future<CursorPage<Conversation>?> read() async {
    final json = await _saved.read(_name);
    if (json == null) return null;
    try {
      final env = api.ConversationListEnvelope.fromJson(json);
      final page = CursorPage(
        items: env.data.map(ChatMappers.conversation).toList(),
      );
      // The live list (if it ran meanwhile) is newer than the disk.
      _memory ??= page;
      return page;
    } on Object {
      return null;
    }
  }
}
