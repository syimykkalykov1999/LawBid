import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/connectivity/connection_title.dart';
import 'package:lawbid/core/connectivity/connectivity_status.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/in_chat_search.dart';
import 'package:lawbid/features/groups/application/chat_list_merge.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_info_sheets.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

Conversation _conv({int unread = 0, bool marked = false}) => Conversation(
      id: 'c1',
      caseId: null,
      caseTitle: null,
      status: ConversationStatus.active,
      contactsUnlocked: true,
      counterpart: const Counterpart(isAttorney: true, verified: true),
      unreadCount: unread,
      updatedAt: DateTime(2026),
      markedUnread: marked,
    );

/// Row 110 (owner list, chat screens pack 3, Telegram / WhatsApp).
void main() {
  group('in-chat search (Telegram 🔍, ↑ / ↓)', () {
    // Server pages of 2 hits, newest first: h0 h1 | h2.
    late List<({String q, String? cursor})> asked;
    late List<String> jumped;
    InChatSearch make() {
      asked = [];
      jumped = [];
      return InChatSearch(
        search: (q, {cursor}) async {
          asked.add((q: q, cursor: cursor));
          if (q == 'none') return const CursorPage<String>(items: []);
          return cursor == null
              ? const CursorPage(items: ['h0', 'h1'], nextCursor: 'p2')
              : const CursorPage(items: ['h2']);
        },
        jump: (id) async {
          jumped.add(id);
          return true;
        },
      );
    }

    test('typing waits for a pause, then jumps to the newest hit', () {
      fakeAsync((async) {
        final s = make()
          ..type('inv')
          ..type('invoice');
        async.elapse(const Duration(milliseconds: 100));
        expect(asked, isEmpty);
        async.elapse(const Duration(milliseconds: 400));
        expect(asked.map((a) => a.q), ['invoice']);
        expect(s.hits, ['h0', 'h1']);
        expect(s.index, 0);
        expect(jumped, ['h0']);
        expect(s.canNewer, isFalse);
        expect(s.canOlder, isTrue);
      });
    });

    test('the pause comes from the admin (client.chat_search_debounce_ms)', () {
      addTearDown(ClientTuning.reset);
      ClientTuning.apply(const {'client.chat_search_debounce_ms': '1000'});
      fakeAsync((async) {
        make().type('invoice');
        async.elapse(const Duration(milliseconds: 900));
        expect(asked, isEmpty, reason: 'still inside the admin pause');
        async.elapse(const Duration(milliseconds: 200));
        expect(asked.map((a) => a.q), ['invoice']);
      });
    });

    test('↑ walks older and loads the next page; ↓ comes back', () async {
      final s = make()..type('invoice');
      await s.submit();
      await s.older();
      expect(jumped, ['h0', 'h1']);
      await s.older();
      expect(asked.last.cursor, 'p2');
      expect(s.hits, ['h0', 'h1', 'h2']);
      expect(jumped.last, 'h2');
      expect(s.canOlder, isFalse);
      await s.newer();
      expect(jumped.last, 'h1');
      expect(s.index, 1);
    });

    test('no hits: nothing to jump to; clearing the field resets', () async {
      final s = make()..type('none');
      await s.submit();
      expect(s.hits, isEmpty);
      expect(s.index, -1);
      expect(jumped, isEmpty);
      s.type('');
      expect(s.query, '');
      expect(s.canOlder, isFalse);
    });
  });

  group('«Ожидание сети… / Соединение…» title (Telegram)', () {
    const ru = StaticTranslatorRu();
    test('online: the normal title', () {
      expect(connectionTitle(ru, null), isNull);
    });
    test('no network / no server', () {
      expect(connectionTitle(ru, OfflineReason.noNetwork), 'Ожидание сети…');
      expect(
        connectionTitle(ru, OfflineReason.serverUnreachable),
        'Соединение…',
      );
    });
  });

  group('«Unread» filter and «Mark as unread»', () {
    test('a chat counts as unread with new messages or my own mark', () {
      expect(_conv().hasUnread, isFalse);
      expect(DirectChatEntry(_conv(unread: 2)).hasUnread, isTrue);
      expect(DirectChatEntry(_conv(marked: true)).hasUnread, isTrue);
    });

    test('«Unread» never goes to the server as a folder name', () {
      // The server knows all · primary · general · cases · waiting ·
      // requests · archive; «unread» is filtered on the device.
      expect(ChatListFolder.values.first, ChatListFolder.all);
      expect(ChatListFolder.values[1], ChatListFolder.unread);
    });
  });

  test('mute: «forever» is the one shared moment', () {
    expect(muteDuration(MuteChoice.forever), kMuteForever);
    expect(muteDuration(MuteChoice.hour), const Duration(hours: 1));
    expect(muteDuration(MuteChoice.off), isNull);
  });
}
