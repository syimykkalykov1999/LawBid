import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_note_sheet.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/shared/domain/user_role.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';

final _conv = Conversation(
  id: 'c1',
  caseId: null,
  caseTitle: null,
  status: ConversationStatus.active,
  contactsUnlocked: true,
  counterpart: const Counterpart(
    isAttorney: false,
    verified: false,
    id: 'u1',
    displayName: 'Anna Petrova',
  ),
  unreadCount: 0,
  updatedAt: DateTime(2026),
  note: 'Send the documents',
);

class _Chats implements ChatRepository {
  final notes = <String?>[];

  @override
  Future<Conversation> organize(
    String id, {
    ChatFolder? folder,
    bool resetFolder = false,
    bool? waiting,
    String? note,
    bool? pinned,
    bool? hidden,
    bool? archived,
  }) async {
    notes.add(note);
    return _conv;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

/// Owner 2026-10-22: «Изменить» left and «Открыть чат» right in one row
/// (equal width), «Удалить» full width under them; delete asks first and
/// clears the note.
void main() {
  setUpAll(initializeDateFormatting);

  for (final role in [UserRole.attorney, UserRole.client]) {
    testWidgets('note sheet layout and delete (${role.name})', (tester) async {
      useNarrowPhone(tester);
      final repo = _Chats();
      await tester.pumpWidget(
        uxApp(
          Scaffold(
            body: Consumer(
              builder: (context, ref, _) => TextButton(
                key: const ValueKey('open'),
                onPressed: () => showChatNoteSheet(context, ref, _conv),
                child: const Text('open'),
              ),
            ),
          ),
          theme: AppTheme.light(),
          size: const Size(360, 780),
          disableAnimations: true,
          overrides: uxOverrides(
            extra: [
              chatRepositoryProvider.overrideWithValue(repo),
              currentUserRoleProvider.overrideWithValue(role),
            ],
          ),
        ),
      );
      await tester.tap(find.byKey(const ValueKey('open')));
      await tester.pumpAndSettle();

      final edit = tester.getRect(find.byKey(const ValueKey('chat-note-edit')));
      final open = tester.getRect(find.byKey(const ValueKey('chat-note-open')));
      final del =
          tester.getRect(find.byKey(const ValueKey('chat-note-delete')));
      expect(edit.left, lessThan(open.left));
      expect((edit.width - open.width).abs(), lessThan(1));
      expect((edit.top - open.top).abs(), lessThan(1));
      expect(del.top, greaterThan(edit.bottom));
      expect(del.width, closeTo(edit.width + open.width + 8, 2));

      // Delete asks first; «cancel» keeps the note.
      await tester.tap(find.byKey(const ValueKey('chat-note-delete')));
      await tester.pumpAndSettle();
      expect(repo.notes, isEmpty);
      await tester.tapAt(const Offset(180, 20));
      await tester.pumpAndSettle();
      expect(repo.notes, isEmpty);

      await tester.tap(find.byKey(const ValueKey('chat-note-delete')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Delete').last);
      await tester.pumpAndSettle();
      expect(repo.notes, ['']);
      expect(find.byKey(const ValueKey('chat-note-delete')), findsNothing);
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(minutes: 5));
    });
  }
}
