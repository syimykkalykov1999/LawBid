import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/media/media_share.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/group_info_screen.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_composer.dart';
import 'package:lawbid/features/profile/presentation/widgets/profile_avatar.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/referral_overrides.dart';
import '../../helpers/ux_harness.dart';
import '../groups/fake_group_repository.dart';

/// Row 110, the rest of the chat pack (Telegram / WhatsApp): «Поделиться»
/// in the photo viewer, search over a group's members, Enter sends on the
/// desktop web.
class _Members extends FakeGroupRepository {
  _Members(api.GroupDetailDto detail) : super(const [], detail);

  final asked = <String>[];

  @override
  Future<List<api.GroupMemberDto>> searchMembers(String id, String q) async {
    asked.add(q);
    return [member(people[4], api.GroupRole.admin)];
  }
}

void main() {
  setUpAll(initializeDateFormatting);

  group('«Поделиться» in the photo viewer', () {
    setUp(() {
      debugGalleryImage = (url) => ColoredBox(
            key: ValueKey(url),
            color: Colors.blueGrey,
          );
    });
    tearDown(() {
      debugGalleryImage = null;
      debugShareMedia = null;
    });

    testWidgets('shares the shown photo through the system sheet', (t) async {
      final shared = <String>[];
      debugShareMedia = (url, mime) async {
        shared.add('$mime $url');
        return true;
      };
      await t.pumpWidget(
        uxApp(
          const Scaffold(
            body: Center(
              child: ProfileAvatar(
                size: 88,
                url: 'https://x.test/me.jpg',
                initials: 'SK',
                viewerCloseLabel: 'Close',
              ),
            ),
          ),
          theme: AppTheme.dark(),
          disableAnimations: true,
        ),
      );
      await t.tap(find.byKey(const ValueKey('avatar-open')));
      await t.pumpAndSettle();
      await t.tap(find.byKey(const ValueKey('gallery-share')));
      await t.pump();
      expect(shared, ['image/jpeg https://x.test/me.jpg']);
    });

    testWidgets('a failed share says so', (t) async {
      debugShareMedia = (url, mime) async => false;
      await t.pumpWidget(
        uxApp(
          const Scaffold(
            body: Center(
              child: ProfileAvatar(
                size: 88,
                url: 'https://x.test/me.jpg',
                initials: 'SK',
                viewerCloseLabel: 'Close',
              ),
            ),
          ),
          theme: AppTheme.dark(),
          disableAnimations: true,
        ),
      );
      await t.tap(find.byKey(const ValueKey('avatar-open')));
      await t.pumpAndSettle();
      await t.tap(find.byKey(const ValueKey('gallery-share')));
      await t.pump();
      await t.pump();
      expect(find.textContaining("Couldn't share"), findsWidgets);
    });
  });

  group('the shared file says its real type', () {
    test('a PNG photo is image/png, not image/jpeg', () async {
      final dir = Directory.systemTemp.createTempSync('share-mime');
      addTearDown(() => dir.deleteSync(recursive: true));
      final f = File('${dir.path}/cached-photo')
        ..writeAsBytesSync([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      expect(
        await mediaMimeFor(f, 'https://x.test/p', fallback: 'image/jpeg'),
        'image/png',
      );
    });

    test('a .mov video is video/quicktime', () async {
      final dir = Directory.systemTemp.createTempSync('share-mime');
      addTearDown(() => dir.deleteSync(recursive: true));
      final f = File('${dir.path}/v')..writeAsBytesSync([0, 0, 0, 0]);
      expect(
        await mediaMimeFor(
          f,
          'https://x.test/clip.mov?sig=1',
          fallback: 'video/mp4',
        ),
        'video/quicktime',
      );
    });
  });

  group("search over a group's members", () {
    late SharedPreferences prefs;
    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      prefs = await SharedPreferences.getInstance();
    });

    Future<void> pump(WidgetTester tester, FakeGroupRepository repo) async {
      tester.view.physicalSize = const Size(390, 1600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        ProviderScope(
          overrides: uxOverrides(
            translator: const StaticTranslatorRu(),
            extra: [
              sharedPreferencesProvider.overrideWithValue(prefs),
              referralOffOverride,
              partnerOffOverride,
              groupRepositoryProvider.overrideWithValue(repo),
              currentUserIdProvider.overrideWithValue('me'),
              realtimeClientProvider.overrideWithValue(null),
            ],
          ),
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const GroupInfoScreen(groupId: 'g1'),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pump(const Duration(milliseconds: 500));
    }

    Future<void> open(WidgetTester tester) async {
      final icon = find.byKey(const ValueKey('group-members-search'));
      await tester.scrollUntilVisible(
        icon,
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(icon);
      await tester.pump();
    }

    Future<void> done(WidgetTester tester) async {
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(minutes: 6));
    }

    testWidgets('every member on the phone: filtered here, no request',
        (tester) async {
      final repo = _Members(groupDetail());
      await pump(tester, repo);
      await open(tester);
      await tester.enterText(
        find.byKey(const ValueKey('group-members-query')),
        'anast',
      );
      await tester.pump();
      expect(find.byKey(const ValueKey('member-u2')), findsOneWidget);
      expect(find.byKey(const ValueKey('member-u1')), findsNothing);
      expect(repo.asked, isEmpty);

      await tester.enterText(
        find.byKey(const ValueKey('group-members-query')),
        'zzz',
      );
      await tester.pump();
      expect(find.byKey(const ValueKey('group-members-none')), findsOneWidget);

      // ✕ brings the whole list back.
      await tester.tap(find.byKey(const ValueKey('group-members-search')));
      await tester.pump();
      expect(find.byKey(const ValueKey('member-u1')), findsOneWidget);
      expect(find.byKey(const ValueKey('group-members-query')), findsNothing);
      await done(tester);
    });

    testWidgets('a small group finds «Анастасия» = Anastasia (server rule)',
        (tester) async {
      final repo = _Members(groupDetail());
      await pump(tester, repo);
      await open(tester);
      await tester.enterText(
        find.byKey(const ValueKey('group-members-query')),
        'Анастасия',
      );
      await tester.pump();
      expect(find.byKey(const ValueKey('member-u2')), findsOneWidget);
      expect(find.byKey(const ValueKey('member-u1')), findsNothing);
      expect(repo.asked, isEmpty);
      await done(tester);
    });

    testWidgets('a big group (more pages on the server): the server finds',
        (tester) async {
      final big = api.GroupDetailDto.fromJson({
        ...groupDetail().toJson(),
        'membersNextCursor': 'page-2',
      });
      final repo = _Members(big);
      await pump(tester, repo);
      await open(tester);
      await tester.enterText(
        find.byKey(const ValueKey('group-members-query')),
        'Вольф',
      );
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pump();
      expect(repo.asked, ['Вольф']);
      expect(find.byKey(const ValueKey('member-u4')), findsOneWidget);
      expect(find.byKey(const ValueKey('member-u1')), findsNothing);
      await done(tester);
    });
  });

  group('desktop web: Enter sends in a group, Shift+Enter is a new line', () {
    tearDown(() => adaptiveShellOverride = null);

    testWidgets('with the @mention list open, Enter picks, not sends',
        (t) async {
      t.view.physicalSize = const Size(1440, 900);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      adaptiveShellOverride = true;
      final sent = <String>[];
      final text = TextEditingController();
      addTearDown(text.dispose);
      await t.pumpWidget(
        uxApp(
          Scaffold(
            body: Align(
              alignment: Alignment.bottomCenter,
              child: GroupComposer(
                controller: text,
                members: [member(people[1], api.GroupRole.member)],
                onSend: (body, _) => sent.add(body),
                onSaveEdit: (_) {},
                onAttach: () {},
                draftKey: 'group:test',
              ),
            ),
          ),
          theme: AppTheme.light(),
          size: const Size(1440, 900),
          overrides: [
            ...uxOverrides(),
            currentUserIdProvider.overrideWithValue('me'),
          ],
        ),
      );
      await t.pump();
      await t.tap(find.byType(TextField));
      await t.enterText(find.byType(TextField), 'hi @Bart');
      await t.pump();
      await t.sendKeyEvent(LogicalKeyboardKey.enter);
      await t.pump();
      expect(sent, isEmpty, reason: 'Enter picked the person');
      expect(text.text, contains('Bartholomew'));
      await t.sendKeyEvent(LogicalKeyboardKey.enter);
      await t.pump();
      expect(sent.single, contains('Bartholomew'));
    });

    testWidgets('group composer', (t) async {
      t.view.physicalSize = const Size(1440, 900);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      adaptiveShellOverride = true;
      final sent = <String>[];
      final text = TextEditingController();
      addTearDown(text.dispose);
      await t.pumpWidget(
        uxApp(
          Scaffold(
            body: Align(
              alignment: Alignment.bottomCenter,
              child: GroupComposer(
                controller: text,
                members: const [],
                onSend: (body, _) => sent.add(body),
                onSaveEdit: (_) {},
                onAttach: () {},
                draftKey: 'group:test',
              ),
            ),
          ),
          theme: AppTheme.light(),
          size: const Size(1440, 900),
          overrides: uxOverrides(),
        ),
      );
      await t.pump();
      await t.tap(find.byType(TextField));
      await t.enterText(find.byType(TextField), 'hello');
      await t.sendKeyDownEvent(LogicalKeyboardKey.shiftLeft);
      await t.sendKeyEvent(LogicalKeyboardKey.enter);
      await t.sendKeyUpEvent(LogicalKeyboardKey.shiftLeft);
      expect(sent, isEmpty);
      await t.sendKeyEvent(LogicalKeyboardKey.enter);
      await t.pump();
      expect(sent, ['hello']);
    });
  });
}
