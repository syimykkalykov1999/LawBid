import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/social/data/saved_json.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-20 (speed, Telegram): the first page of the chat list
/// ("All" folder, no search) kept on the phone ([SavedJson]), so the inbox
/// opens at once on the last list and the live one replaces it in the
/// background.
class ChatListCache {
  const ChatListCache(this._saved);

  final SavedJson _saved;

  static const _name = 'chats';

  /// [envelope] is the server's answer for the first page, as received.
  void save(api.ConversationListEnvelope envelope) =>
      _saved.save(_name, envelope.toJson());

  /// The saved page, or null when there is none or it cannot be read.
  /// No next cursor: the live page brings it.
  Future<CursorPage<Conversation>?> read() async {
    final json = await _saved.read(_name);
    if (json == null) return null;
    try {
      final env = api.ConversationListEnvelope.fromJson(json);
      return CursorPage(
        items: env.data.map(ChatMappers.conversation).toList(),
      );
    } on Object {
      return null;
    }
  }
}
