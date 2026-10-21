import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/chat_selection.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_selection_bar.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../helpers/long_locale.dart';
import '../helpers/ux_harness.dart';

/// Owner 2026-10-20 (Samsung, build 78a4e1cd): the multi-select panel clipped
/// «Закрепить» and «Переме…» at ru ×1.1 on 360 dp. Telegram: icon + short
/// caption, and when the captions do not fit — icons only, caption in the
/// tooltip. Nothing is cut, in ru / ne / de / ar / mr, ×1.0 and ×1.1.
Conversation _conv() => Conversation(
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
    );

class _Selected extends ChatSelection {
  @override
  Set<String>? build() => {'c1'};
}

class _Chats implements ChatRepository {
  _Chats({this.failRead = false, this.failOrganize = false});

  /// After a successful write the lists cannot be re-read (offline blip).
  final bool failRead;
  final bool failOrganize;
  bool wrote = false;
  final archived = <bool?>[];

  @override
  Future<CursorPage<Conversation>> conversations({
    String? cursor,
    DateTime? updatedSince,
    bool requests = false,
    ChatListFolder folder = ChatListFolder.all,
    String? q,
  }) async {
    if (failRead && wrote) throw StateError('list re-read failed');
    return CursorPage(items: [_conv()]);
  }

  @override
  Future<({int waiting, int requests, int cases, int archived})>
      folderCounts() async {
    if (failRead && wrote) throw StateError('counts re-read failed');
    return (waiting: 0, requests: 0, cases: 0, archived: 0);
  }

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
    if (failOrganize) throw StateError('write failed');
    wrote = true;
    this.archived.add(archived);
    return _conv();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

Future<void> _pump(
  WidgetTester tester,
  Translator t,
  TextDirection dir,
  double scale,
  ChatRepository repo,
) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = const Size(360, 800);
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    uxApp(
      Directionality(
        textDirection: dir,
        child: Scaffold(
          body: const SizedBox.expand(),
          bottomNavigationBar: ChatSelectionBar(chats: [_conv()]),
        ),
      ),
      size: const Size(360, 800),
      textScale: scale,
      theme: AppTheme.light(),
      disableAnimations: true,
      overrides: uxOverrides(
        translator: t,
        extra: [
          chatRepositoryProvider.overrideWithValue(repo),
          chatSelectionProvider.overrideWith(_Selected.new),
        ],
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _end(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox());
  await tester.pump(const Duration(minutes: 5));
}

void main() {
  setUpAll(initializeDateFormatting);

  final locales = <String, (Translator, TextDirection)>{
    'longest': (LongestTranslator(), TextDirection.ltr),
    'longest rtl': (LongestTranslator(), TextDirection.rtl),
    'ne': (ShippedTranslator('ne'), TextDirection.ltr),
    'de': (ShippedTranslator('de'), TextDirection.ltr),
    'ar': (ShippedTranslator('ar'), TextDirection.rtl),
    'mr': (ShippedTranslator('mr'), TextDirection.ltr),
    'ru': (
      L10nTranslator(language: AppLanguage.ru, cache: const {}),
      TextDirection.ltr,
    ),
  };
  const keys = [
    'select-archive',
    'select-pin',
    'select-mute',
    'select-read',
    'select-delete',
  ];

  for (final scale in [1.0, 1.1]) {
    for (final e in locales.entries) {
      testWidgets('selection bar fits 360 dp: ${e.key} x$scale',
          (tester) async {
        await _pump(tester, e.value.$1, e.value.$2, scale, _Chats());
        expect(tester.takeException(), isNull);
        for (final k in keys) {
          final r = tester.getRect(find.byKey(ValueKey(k)));
          expect(r.left, greaterThanOrEqualTo(0), reason: k);
          expect(r.right, lessThanOrEqualTo(360), reason: k);
          expect(r.width, greaterThanOrEqualTo(44), reason: k);
        }
        // Either every caption is whole on one line, or none is shown and
        // each action keeps a tooltip.
        final texts = find.descendant(
          of: find.byType(ChatSelectionBar),
          matching: find.byType(Text),
        );
        if (texts.evaluate().isEmpty) {
          expect(find.byType(Tooltip), findsNWidgets(keys.length));
        } else {
          expect(texts, findsNWidgets(keys.length));
          for (final el in texts.evaluate()) {
            final box = el.renderObject! as RenderBox;
            expect(box.size.height, lessThan(24 * scale + 8));
          }
        }
        await _end(tester);
      });
    }
  }

  testWidgets('ru x1.0: icons with the short captions the owner asked for',
      (tester) async {
    await _pump(
      tester,
      L10nTranslator(language: AppLanguage.ru, cache: const {}),
      TextDirection.ltr,
      1,
      _Chats(),
    );
    for (final s in [
      'В архив',
      'Закрепить',
      'Без звука',
      'Прочитано',
      'Удалить',
    ]) {
      expect(find.text(s), findsOneWidget);
    }
    expect(find.text('Переместить'), findsNothing);
    await _end(tester);
  });

  testWidgets('archive: the chat moves, and a failing re-read is not a toast',
      (tester) async {
    final repo = _Chats(failRead: true);
    await _pump(tester, const StaticTranslatorEn(), TextDirection.ltr, 1, repo);
    await tester.tap(find.byKey(const ValueKey('select-archive')));
    await tester.pumpAndSettle();
    expect(repo.archived, [true]);
    expect(
      find.text(const StaticTranslatorEn().t('error.default.message')),
      findsNothing,
    );
    await _end(tester);
  });

  testWidgets('archive: a failed write still says so', (tester) async {
    final repo = _Chats(failOrganize: true);
    await _pump(tester, const StaticTranslatorEn(), TextDirection.ltr, 1, repo);
    await tester.tap(find.byKey(const ValueKey('select-archive')));
    await tester.pumpAndSettle();
    expect(
      find.text(const StaticTranslatorEn().t('error.default.message')),
      findsOneWidget,
    );
    await _end(tester);
  });
}
