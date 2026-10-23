import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/chat/data/chat_extras_repository.dart';
import 'package:lawbid/features/chat/presentation/saved_chats_view.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

class _Empty implements ChatExtrasRepository {
  final tabs = <SavedChatTab>[];

  @override
  Future<CursorPage<SavedChatEntry>> saved({
    SavedChatTab tab = SavedChatTab.all,
    String? query,
    String? cursor,
  }) async {
    tabs.add(tab);
    return const CursorPage(items: []);
  }

  @override
  Future<Set<String>> savedIds() async => {};

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('${invocation.memberName}');
}

Future<void> _pump(
  WidgetTester tester,
  SavedChatsView view, {
  _Empty? repo,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        translatorProvider.overrideWithValue(const StaticTranslatorEn()),
        chatExtrasRepositoryProvider.overrideWithValue(repo ?? _Empty()),
      ],
      child: MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(body: view),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 300));
}

void main() {
  testWidgets('own search field and a chat-specific empty text', (t) async {
    await _pump(t, const SavedChatsView());
    expect(find.byType(TextField), findsOneWidget);
    expect(find.text('Search saved'), findsOneWidget);
    expect(find.text('No saved messages yet'), findsOneWidget);
    expect(find.textContaining('case'), findsNothing);
  });

  testWidgets('with a query from the screen it draws no search field', (
    t,
  ) async {
    await _pump(t, const SavedChatsView(query: ''));
    expect(find.byType(TextField), findsNothing);
    expect(find.text('No saved messages yet'), findsOneWidget);
  });

  // Owner 2026-10-22: All | Media | Files | Links swipe like tabs.
  testWidgets('a swipe goes to the next tab', (t) async {
    final repo = _Empty();
    await _pump(t, const SavedChatsView(), repo: repo);
    await t.drag(find.byType(PageView), const Offset(-400, 0));
    await t.pumpAndSettle();
    expect(repo.tabs, contains(SavedChatTab.media));
  });

  testWidgets('a query that finds nothing says so', (t) async {
    await _pump(t, const SavedChatsView(query: 'zzz'));
    expect(find.text('No saved messages yet'), findsNothing);
  });
}
