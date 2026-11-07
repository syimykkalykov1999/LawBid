import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/screens/work_case_screen.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';
import 'package:lawbid/features/channels/presentation/sections_archive.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_video.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_chat_tile.dart';
import 'package:lawbid/features/stories/application/stories_providers.dart';
import 'package:lawbid/features/stories/domain/story_models.dart';
import 'package:lawbid/features/stories/presentation/story_viewer_sheets.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../features/cases/cases_fakes.dart';
import '../features/cases/cases_test.dart' show bidFixture;
import '../features/channels/channels_fakes.dart' as ch;
import '../features/groups/fake_group_repository.dart';
import '../features/stories/stories_fakes.dart';
import '../helpers/long_locale.dart';
import '../helpers/overflow_fixtures.dart';
import '../helpers/overflow_harness.dart';

/// Owner 2026-11-02, batch 7: the last six screens the long-text test had
/// not covered (docs/HANDOFF.md, "what is covered and what is left"): the
/// story viewers sheet, the groups' and channels' Archive screens, the
/// video in a chat (bubble and full screen), the paginated list with long
/// rows, and the attorney's work-case screen with real data.
/// 360 dp, the longest text of every key, right-to-left, ne, de, mr, ar, ru,
/// at text scale 1 and 1.3; then the four themes.
typedef _Case = (
  Widget Function() build,
  Future<void> Function(WidgetTester) act,
  List<Override> extra,
);

const _longName = StoryUser(
  id: 'v1',
  username: 'danielkim_immigration_and_family_law_partners',
  firstName: 'Bartholomew-Maximilian',
  lastName: 'Featherstonehaugh-Montgomery',
  verified: true,
);

class _WorkCaseRepo extends FakeCasesRepository {
  @override
  Future<FeedCase> attorneyCase(String caseId) async => FeedCase(
        id: caseId,
        title: longTitle,
        description: longText,
        practice: const PracticeRef(
          id: 'leaf-1',
          code: 'landlord_tenant',
          i18nKey: 'practice.traffic',
          nameEn: 'Commercial Landlord and Tenant Disputes',
          categoryNameEn: 'Real Estate and Property',
        ),
        primaryStateCode: 'NJ',
        additionalStateCodes: const ['NY', 'PA', 'CT'],
        city: longPlace,
        status: CaseStatus.pendingCompletion,
        completionRequestedBy: 'client',
        budget: const CaseBudget(
          mode: BudgetMode.amount,
          amountCents: 99999999999,
        ),
        viewCount: 1234567,
        bidsCount: 9999,
        createdAt: DateTime(2026, 9, 2),
        isNew: false,
        hasOwnBid: true,
        ownBidId: 'bid-1',
        acceptedBidIsMine: true,
        privateDetails: longText,
      );

  @override
  Future<ClientContacts> contacts(String caseId) async => ClientContacts(
        caseId: caseId,
        bidId: 'bid-1',
        firstName: 'Bartholomew-Maximilian',
        lastName: 'Featherstonehaugh-Montgomery',
        phone: '+1 (555) 123-4567 ext. 98765',
        email: 'bartholomew.featherstonehaugh.montgomery@example-law-firm.com',
        contactMethod: ContactMethod.email,
        contactNote: longText,
        disclosedAt: DateTime(2026, 10),
      );

  @override
  Future<CaseBid> bid(String bidId) async =>
      bidFixture(status: BidStatus.accepted);

  @override
  Future<void> recordViews(List<String> caseIds) async {}
}

/// The list with the app's own row, long labels and the real footer keys.
Widget _paginated() => Scaffold(
      body: Consumer(
        builder: (context, ref, _) {
          final t = ref.watch(translatorProvider);
          return AppPaginatedListView<int>(
            items: List.generate(6, (i) => i),
            itemKey: (i) => i,
            status: AppPaginationStatus.loading,
            labels: AppPaginationLabels(
              loadingMore: t.t('pagination.loadingMore'),
              error: t.t('pagination.error'),
              retry: t.t('error.retry'),
              end: t.t('pagination.end'),
            ),
            onLoadMore: () {},
            onRetry: () {},
            onRefresh: () async {},
            header: Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.md),
              child: Text(t.t('verification.title')),
            ),
            itemBuilder: (context, i, _) => AppListRow(
              key: ValueKey('paged-row-$i'),
              icon: AppIcons.inventory2Outlined,
              label: '$longTitle $i',
              onTap: () {},
            ),
          );
        },
      ),
    );

const _video = ChatAttachment(
  fileId: 'f1',
  name: 'Agreement_between_the_parties_final_version_signed.mp4',
  isImage: false,
  url: 'https://example.test/v.mp4',
  mime: 'video/mp4',
  sizeBytes: 123456789012,
);

void main() {
  setUpAll(initializeDateFormatting);

  final story = fakeStory('s1', mine: true, views: 99999999);

  final cases = <String, _Case>{
    'story viewers sheet': (
      () => overflowOpener((c, r) => showStoryViewersSheet(c, r, story)),
      overflowShows(find.textContaining('Bartholomew'), sheet: true),
      [
        storiesRepositoryProvider.overrideWithValue(
          FakeStoriesRepository(
            viewerPages: [
              CursorPage(
                items: [
                  for (var i = 0; i < 4; i++)
                    StoryViewer(
                      user: StoryUser(
                        id: 'v$i',
                        username: _longName.username,
                        firstName: _longName.firstName,
                        lastName: _longName.lastName,
                        verified: true,
                      ),
                      viewedAt: DateTime.now()
                          .subtract(Duration(days: 300 + i, hours: 5)),
                    ),
                ],
              ),
            ],
          ),
        ),
      ],
    ),
    'groups archive': (
      () => const GroupsArchiveScreen(),
      overflowShows(find.byType(GroupChatTile)),
      [
        groupRepositoryProvider.overrideWithValue(
          FakeGroupRepository()
            ..archivedItems = [
              listGroup('a1', unread: 12345, mentions: 99, muted: true),
              listGroup('a2', pinned: true),
            ],
        ),
      ],
    ),
    'channels archive': (
      () => const ChannelsArchiveScreen(),
      overflowShows(find.byKey(const ValueKey('channel-archived-a1'))),
      [
        channelsRepositoryProvider.overrideWithValue(
          ch.FakeChannelsRepository()
            ..archivedListed = [
              ch.fakeChannel(
                id: 'a1',
                title: longTitle,
                username: 'a_really_long_channel_username_for_the_archive',
                subscribed: true,
                muted: true,
                subscribers: 99999999,
              ),
            ],
        ),
      ],
    ),
    'chat video (bubble, sending)': (
      () => const Scaffold(
            body: Center(
              child: ChatVideoTile(
                attachment: _video,
                sending: true,
                playLabel: 'play',
              ),
            ),
          ),
      overflowShows(find.byType(ChatVideoTile)),
      const [],
    ),
    'chat video (bubble, grid cell)': (
      () => const Scaffold(
            body: Center(
              child: SizedBox.square(
                dimension: 60,
                child: ChatVideoTile(
                  attachment: _video,
                  sending: false,
                  playLabel: 'play',
                  fill: true,
                ),
              ),
            ),
          ),
      overflowShows(find.byType(ChatVideoTile)),
      const [],
    ),
    'chat video (full screen)': (
      () => const ChatVideoScreen(url: 'https://example.test/v.mp4'),
      overflowShows(find.byType(ChatVideoScreen)),
      const [],
    ),
    'paginated list (long rows)': (
      _paginated,
      overflowShows(find.byKey(const ValueKey('paged-row-0'))),
      const [],
    ),
    'work case (data)': (
      () => const WorkCaseScreen(caseId: 'c1'),
      overflowShows(find.textContaining('Springfield')),
      const [],
    ),
  };

  final variants = <(String, Translator, TextDirection, double, AppThemeId)>[
    for (final scale in overflowScales)
      for (final MapEntry(key: name, value: (t, dir))
          in overflowLocales().entries)
        ('$name, x$scale', t, dir, scale, AppThemeId.day),
    for (final themeId in overflowThemes.where((x) => x != AppThemeId.day))
      (
        'themes (${themeId.name}, longest, x1.3)',
        LongestTranslator(),
        TextDirection.ltr,
        DeviceTextScale.shellMax,
        themeId,
      ),
  ];

  for (final (name, t, dir, scale, themeId) in variants) {
    group('batch 7: no overflow at 360 dp ($name)', () {
      for (final MapEntry(key: label, value: (build, act, extra))
          in cases.entries) {
        testWidgets(label, (tester) async {
          await pumpOverflowApp(
            tester,
            build(),
            t: t,
            dir: dir,
            scale: scale,
            theme: themeId,
            extra: extra,
            cases: label.startsWith('work case') ? _WorkCaseRepo() : null,
            act: act,
          );
        });
      }
    });
  }
}
