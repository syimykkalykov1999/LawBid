import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/create_group_screen.dart';
import 'package:lawbid/features/groups/presentation/find_groups_screen.dart';
import 'package:lawbid/features/groups/presentation/group_conversation_screen.dart';
import 'package:lawbid/features/groups/presentation/group_info_screen.dart';
import 'package:lawbid/features/groups/presentation/join_group_screen.dart';
import 'package:lawbid/features/groups/presentation/poll/create_poll_sheet.dart';
import 'package:lawbid/features/groups/presentation/poll/poll_bubble.dart';
import 'package:lawbid/features/groups/presentation/poll/poll_voters_sheet.dart';
import 'package:lawbid/features/groups/presentation/widgets/people_picker.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;
import 'package:shared_preferences/shared_preferences.dart';

import '../features/groups/fake_group_repository.dart';
import '../helpers/long_locale.dart';
import '../helpers/referral_overrides.dart';
import '../helpers/ux_harness.dart';

/// Owner 2026-10-20: the group chat screens and the polls on a 360 dp phone
/// in the longest translation of every key, the same right-to-left, in
/// Nepali, Arabic and Russian, at text scale 1 and 1.1 (the largest the app
/// allows, lib/app.dart). Any overflow fails.
class _Chats implements ChatRepository {
  @override
  Future<CursorPage<Conversation>> conversations({
    String? cursor,
    DateTime? updatedSince,
    bool requests = false,
    ChatListFolder folder = ChatListFolder.all,
    String? q,
  }) async =>
      CursorPage(
        items: [
          for (final p in people.skip(1))
            Conversation(
              id: 'c-${p.userId}',
              caseId: null,
              caseTitle: null,
              status: ConversationStatus.active,
              isDirect: true,
              contactsUnlocked: true,
              counterpart: Counterpart(
                id: p.userId,
                displayName: p.displayName,
                isAttorney: false,
                verified: false,
              ),
              unreadCount: 0,
              updatedAt: DateTime(2026),
            ),
        ],
      );

  @override
  Future<({int waiting, int requests})> folderCounts() async =>
      (waiting: 0, requests: 0);

  @override
  Future<int> requestsCount() async => 0;

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

void main() {
  setUpAll(initializeDateFormatting);

  final locales = <String, (Translator, TextDirection)>{
    'longest of all languages': (LongestTranslator(), TextDirection.ltr),
    'longest, right-to-left': (LongestTranslator(), TextDirection.rtl),
    'ne': (ShippedTranslator('ne'), TextDirection.ltr),
    'ar': (ShippedTranslator('ar'), TextDirection.rtl),
    'ru': (
      L10nTranslator(language: AppLanguage.ru, cache: const {}),
      TextDirection.ltr,
    ),
  };

  late SharedPreferences prefs;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
  });

  for (final scale in [1.0, 1.1]) {
    for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
      group('no overflow at 360 dp ($name, text x$scale)', () {
        List<Override> overrides(FakeGroupRepository repo) => uxOverrides(
              translator: t,
              extra: [
                sharedPreferencesProvider.overrideWithValue(prefs),
                referralOffOverride,
                partnerOffOverride,
                groupRepositoryProvider.overrideWithValue(repo),
                chatRepositoryProvider.overrideWithValue(_Chats()),
                currentUserIdProvider.overrideWithValue('me'),
                realtimeClientProvider.overrideWithValue(null),
              ],
            );

        Widget frame(BuildContext context, Widget? child) => Directionality(
              textDirection: dir,
              child: MediaQuery(
                data: MediaQuery.of(context).copyWith(
                  textScaler: TextScaler.linear(scale),
                  disableAnimations: true,
                ),
                child: child!,
              ),
            );

        Future<void> pump(
          WidgetTester tester,
          Widget home,
          FakeGroupRepository repo, {
          ThemeData? theme,
        }) async {
          useNarrowPhone(tester);
          await tester.pumpWidget(
            ProviderScope(
              overrides: overrides(repo),
              child: MaterialApp(
                debugShowCheckedModeBanner: false,
                theme: theme ?? AppTheme.light(),
                builder: frame,
                home: home,
              ),
            ),
          );
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 500));
          await tester.pump(const Duration(milliseconds: 500));
        }

        Future<void> scrollThrough(WidgetTester tester) async {
          final list = find.byWidgetPredicate(
            (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
          );
          for (var i = 0; i < 12; i++) {
            if (list.evaluate().isEmpty) return;
            await tester.drag(
              list.first,
              const Offset(0, -400),
              warnIfMissed: false,
            );
            await tester.pump(const Duration(milliseconds: 300));
            expect(tester.takeException(), isNull);
          }
        }

        // Lets keep-alive timers of the list providers run out.
        Future<void> settle(WidgetTester tester) async {
          await tester.pumpWidget(const SizedBox());
          await tester.pump(const Duration(minutes: 6));
        }

        Widget opener(void Function(BuildContext, WidgetRef) open) => Scaffold(
              body: Consumer(
                builder: (context, ref, _) => TextButton(
                  onPressed: () => open(context, ref),
                  child: const Text('open'),
                ),
              ),
            );

        // 1. The conversation: every kind of message, pinned message.
        testWidgets('conversation with every kind of message', (tester) async {
          final repo = FakeGroupRepository(
            const [],
            groupDetail(),
            richThread(),
          );
          await pump(
            tester,
            const GroupConversationScreen(groupId: 'g1'),
            repo,
            theme: AppTheme.dark(),
          );
          expect(find.byType(PollBubble), findsWidgets);
          expect(tester.takeException(), isNull);
          await scrollThrough(tester);
          await settle(tester);
        });

        testWidgets('conversation with a failed message', (tester) async {
          final repo = FakeGroupRepository(
            const [],
            groupDetail(withPinned: false),
            richThread(),
          )..failSend = true;
          await pump(
            tester,
            const GroupConversationScreen(groupId: 'g1'),
            repo,
          );
          await tester.enterText(
            find.byType(TextField).last,
            'This message will not be delivered, the network is gone',
          );
          await tester.pump();
          await tester.testTextInput.receiveAction(TextInputAction.send);
          await tester.pump(const Duration(milliseconds: 500));
          expect(tester.takeException(), isNull);
          await settle(tester);
        });

        testWidgets('forum group shows the topic list', (tester) async {
          final repo = FakeGroupRepository(
            const [],
            groupDetail(forum: true, withPinned: false),
            const [],
            topics(),
          );
          await pump(
            tester,
            const GroupConversationScreen(groupId: 'g1'),
            repo,
          );
          expect(find.textContaining('Discussion of the open'), findsWidgets);
          expect(tester.takeException(), isNull);
          await scrollThrough(tester);
          await settle(tester);
        });

        testWidgets('conversation in a topic', (tester) async {
          final repo = FakeGroupRepository(
            const [],
            groupDetail(forum: true),
            richThread(),
            topics(),
          );
          await pump(
            tester,
            const GroupConversationScreen(groupId: 'g1', topicId: 't1'),
            repo,
          );
          expect(tester.takeException(), isNull);
          await settle(tester);
        });

        testWidgets('read-only: only admins write', (tester) async {
          final repo = FakeGroupRepository(
            const [],
            groupDetail(owner: false, onlyAdminsWrite: true, readOnly: true),
            richThread(),
          );
          await pump(
            tester,
            const GroupConversationScreen(groupId: 'g1'),
            repo,
          );
          expect(tester.takeException(), isNull);
          await settle(tester);
        });

        // 2. Group info: owner with admin settings, and a plain member.
        for (final owner in [true, false]) {
          testWidgets('group info (${owner ? 'owner' : 'member'})',
              (tester) async {
            final repo = FakeGroupRepository(
              const [],
              groupDetail(owner: owner, forum: true),
              const [],
              topics(),
              joinRequests(),
            );
            await pump(tester, const GroupInfoScreen(groupId: 'g1'), repo);
            expect(find.byKey(const ValueKey('group-info')), findsOneWidget);
            expect(tester.takeException(), isNull);
            await scrollThrough(tester);
            await settle(tester);
          });
        }

        // 3. Create a group: members step, then details with each type.
        testWidgets('create group, both steps', (tester) async {
          await pump(
            tester,
            const CreateGroupScreen(),
            FakeGroupRepository(),
          );
          expect(tester.takeException(), isNull);
          for (final p in people.skip(1).take(3)) {
            await tester.tap(find.text(p.displayName!).first);
            await tester.pump();
          }
          expect(tester.takeException(), isNull);
          await tester.tap(find.byKey(const ValueKey('create-next')));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          await tester.enterText(
            find.byKey(const ValueKey('group-title')),
            'Alexandra Montgomery-Kim & partners: immigration cases',
          );
          for (final type in ['closed', 'public', 'private']) {
            await tester.ensureVisible(
              find.byKey(ValueKey('group-type-$type')),
            );
            await tester.tap(find.byKey(ValueKey('group-type-$type')));
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull);
            if (type == 'public') {
              await tester.enterText(
                find.byKey(const ValueKey('group-username')),
                'a_very_long_public_username_of_the_group_x',
              );
              await tester.pumpAndSettle();
              expect(tester.takeException(), isNull);
            }
          }
          await scrollThrough(tester);
          await settle(tester);
        });

        // 4. Find groups, with results.
        testWidgets('find groups with results', (tester) async {
          final repo = FakeGroupRepository(
            const [],
            null,
            const [],
            const [],
            const [],
            [
              invitePreview(type: api.GroupType.public),
              invitePreview(alreadyMember: true, type: api.GroupType.public),
              invitePreview(
                approval: false,
                requestPending: true,
                type: api.GroupType.public,
              ),
            ],
          );
          await pump(tester, const FindGroupsScreen(), repo);
          await tester.enterText(
            find.byKey(const ValueKey('find-search')),
            'immigration',
          );
          await tester.pump(const Duration(seconds: 1));
          await tester.pump(const Duration(milliseconds: 500));
          expect(tester.takeException(), isNull);
          expect(find.byKey(const ValueKey('found-g1')), findsWidgets);
          await scrollThrough(tester);
          await settle(tester);
        });

        // 5. Join by link: needing approval, open, already a member.
        final joins = <String, api.GroupInvitePreviewDto>{
          'needs approval': invitePreview(),
          'open public': invitePreview(
            approval: false,
            type: api.GroupType.public,
          ),
          'request sent': invitePreview(requestPending: true),
          'already a member': invitePreview(alreadyMember: true),
        };
        for (final MapEntry(key: label, value: preview) in joins.entries) {
          testWidgets('join group ($label)', (tester) async {
            final repo = FakeGroupRepository(
              const [],
              null,
              const [],
              const [],
              const [],
              const [],
              preview,
            );
            await pump(tester, const JoinGroupScreen(code: 'AbCdEf'), repo);
            expect(tester.takeException(), isNull);
            await scrollThrough(tester);
            await settle(tester);
          });
        }

        // 6. The poll bubble in all its states.
        final polls = <String, api.PollDto>{
          'single': poll('p1'),
          'multiple': poll('p1', multiple: true),
          'multiple, voted': poll('p1', multiple: true, myVotes: ['o0', 'o2']),
          'anonymous': poll('p1', anonymous: true),
          'open, voted': poll('p1', myVotes: ['o1']),
          'closed': poll('p1', closed: true, myVotes: ['o1']),
          'closed, anonymous': poll('p1', anonymous: true, closed: true),
          'short question': poll('p1', question: 'Ok?', voters: 1),
          'no votes': poll('p1', voters: 0),
        };
        for (final MapEntry(key: label, value: p) in polls.entries) {
          for (final canClose in [true, false]) {
            testWidgets('poll bubble ($label, canClose $canClose)',
                (tester) async {
              await pump(
                tester,
                Scaffold(
                  body: SingleChildScrollView(
                    child: Padding(
                      padding: const EdgeInsets.all(AppSpacing.md),
                      child: PollBubble(
                        groupId: 'g1',
                        message: pollMessage('m1', p),
                        canClose: canClose,
                      ),
                    ),
                  ),
                ),
                FakeGroupRepository(),
              );
              expect(tester.takeException(), isNull);
              // Tap the first option: the draft / vote state must fit too.
              final option = find.byType(InkWell);
              if (option.evaluate().isNotEmpty) {
                await tester.tap(option.first, warnIfMissed: false);
                await tester.pump(const Duration(milliseconds: 300));
                expect(tester.takeException(), isNull);
              }
            });
          }
        }

        // 7. The sheets.
        testWidgets('create poll sheet', (tester) async {
          await pump(
            tester,
            opener(
              (context, _) => showCreatePollSheet(context, groupId: 'g1'),
            ),
            FakeGroupRepository(),
          );
          await tester.tap(find.text('open'));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          final fields = find.byType(TextField);
          await tester.enterText(
            fields.first,
            'Which day suits the whole team best for the quarterly review '
            'with all the partners?',
          );
          await tester.pump();
          for (var i = 1; i < 3; i++) {
            if (fields.evaluate().length > i) {
              await tester.enterText(
                fields.at(i),
                'Monday morning, right after the weekly stand-up meeting',
              );
            }
          }
          await tester.pump();
          expect(tester.takeException(), isNull);
          await scrollThrough(tester);
        });

        testWidgets('poll voters sheet', (tester) async {
          await pump(
            tester,
            opener(
              (context, _) => showPollVotersSheet(
                context,
                groupId: 'g1',
                poll: poll('p1', multiple: true),
              ),
            ),
            FakeGroupRepository(
              const [],
              null,
              const [],
              const [],
              const [],
              const [],
              null,
              pollVoters(),
            ),
          );
          await tester.tap(find.text('open'));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          await scrollThrough(tester);
        });

        testWidgets('people picker sheet', (tester) async {
          await pump(
            tester,
            opener((context, _) => showPeoplePicker(context)),
            FakeGroupRepository(),
          );
          await tester.tap(find.text('open'));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          await tester.tap(find.text(people[1].displayName!).first);
          await tester.tap(find.text(people[2].displayName!).first);
          await tester.pump();
          expect(tester.takeException(), isNull);
          await settle(tester);
        });

        // 8. Group tiles in the Chats list.
        testWidgets('chats inbox with group tiles', (tester) async {
          final repo = FakeGroupRepository([
            listGroup('a', pinned: true, unread: 5, minutes: 5),
            listGroup('b', muted: true, unread: 1234, minutes: 4),
            listGroup('c', unread: 3, mentions: 2, minutes: 3),
            listGroup('d', type: api.GroupType.public, minutes: 2),
            listGroup('e', pinned: true, muted: true, mentions: 1, minutes: 1),
          ]);
          await pump(
            tester,
            const Scaffold(body: ConversationsView()),
            repo,
          );
          await tester.pumpAndSettle();
          expect(find.byKey(const ValueKey('group-tile-a')), findsOneWidget);
          expect(tester.takeException(), isNull);
          await scrollThrough(tester);
          await settle(tester);
        });
      });
    }
  }
}
