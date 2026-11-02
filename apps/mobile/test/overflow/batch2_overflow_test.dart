import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/presentation/screens/attorney_cases_tab.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';
import 'package:lawbid/features/channels/presentation/channel_post_card.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/presentation/screens/attorney_stats_screen.dart';
import 'package:lawbid/features/profile/presentation/widgets/client_profile_view.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/comments_sheet.dart';
import 'package:lawbid/features/social/presentation/widgets/post_text_sheet.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import 'package:lawbid_api/lawbid_api.dart' as api;

import '../features/cases/cases_fakes.dart';
import '../features/channels/channels_fakes.dart' as ch;
import '../features/profile/profile_fakes.dart';
import '../features/social/social_fakes.dart';
import '../helpers/long_locale.dart';
import '../helpers/overflow_fixtures.dart';
import '../helpers/overflow_harness.dart';

/// Owner 2026-11-02, batch 2 of the screens no overflow test had covered:
/// client profile, attorney cases tab, attorney statistics, a channel post,
/// and the comments / post-text sheets, with long names, texts and counts.
/// 360 dp, the longest text of every key, right-to-left, ne, de, mr, ar, ru,
/// at text scale 1 and 1.3; then the four themes in the longest text.
typedef _Case = (
  Widget Function() build,
  Future<void> Function(WidgetTester)? act,
  bool client,
  List<Override> extra,
  FakeCasesRepository? cases,
  FakeSocialRepository? social,
);

/// A post whose comments have a long author name and a long text.
class LongCommentsSocial extends FakeSocialRepository {
  @override
  Future<CursorPage<Comment>> comments(
    String postId, {
    String? cursor,
  }) async =>
      CursorPage(
        items: [
          for (var i = 0; i < 2; i++)
            Comment(
              id: 'c$i',
              postId: postId,
              author: const CommentAuthor(
                isAttorney: true,
                displayName: 'Bartholomew-Alexander-Maximilian Wolfeschlegel',
                verified: true,
                username: 'a_very_long_username_of_thirty_chars',
              ),
              body: '$longText $longText',
              likeCount: 1234567,
              replyCount: 9999,
              likedByMe: true,
              canDelete: true,
              isMine: false,
              createdAt: DateTime(2026, 10, 30),
            ),
        ],
      );
}

void main() {
  setUpAll(initializeDateFormatting);

  /// The stats tiles are on screen: no spinner, no retry button, and a
  /// label with a value for each of the four numbers.
  Future<void> statsShown(WidgetTester tester) async {
    await tester.pump(const Duration(seconds: 2));
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.byType(AppButton), findsNothing);
    expect(find.byType(Text), findsAtLeastNWidgets(9));
  }

  const longBody = '$longText $longText';
  final longChannelPost = ch.fakePost(
    'cp1',
    body: longBody,
    comments: 1234567,
    views: 98765432,
    mine: '👍',
  );
  final channel = ch.fakeChannel(
    title: 'Международная налоговая ${'консультация' * 4}',
    username: 'a_very_long_channel_username_32ch',
    subscribers: 9999999,
  );

  final profileExtra = <Override>[
    attorneyProfileRepositoryProvider.overrideWithValue(
      FakeAttorneyRepo(
        profile: attorneyProfile(),
        own: const OwnAttorneyProfile(
          id: 'att-1',
          username: 'jane.doe',
          firstName: 'Jane',
          lastName: 'Doe',
          verification: AttorneyVerification.verified,
          verifiedBadge: true,
        ),
      ),
    ),
    practicesRepositoryProvider.overrideWithValue(FakePracticesRepo()),
    reviewsRepositoryProvider.overrideWithValue(FakeReviewsRepo()),
    clientProfileRepositoryProvider.overrideWithValue(
      FakeClientRepo()
        ..profile = const ClientProfileDetails(
          id: 'cl-1',
          username: 'a_very_long_username_of_thirty_chars',
          firstName: 'Bartholomew-Alexander-Maximilian',
          lastName: 'Wolfeschlegelsteinhausenbergerdorff',
          state: StateRef(code: 'CA', name: 'California'),
          languages: ['en'],
          contactMethod: ContactPreference.sms,
        ),
    ),
    clockProvider.overrideWithValue(() => kNow),
  ];

  Map<String, _Case> cases() => {
        'client profile': (
          () => const ClientProfileView(),
          overflowShows(find.textContaining('Bartholomew')),
          true,
          profileExtra,
          null,
          null,
        ),
        'attorney cases tab': (
          () => const AttorneyCasesTab(),
          overflowShows(find.textContaining('Disputed commercial')),
          false,
          profileExtra,
          LongFeedCasesRepository(),
          null,
        ),
        'attorney stats': (
          () => const AttorneyStatsScreen(),
          statsShown,
          false,
          [
            attorneyStatsProvider.overrideWith(
              (ref) async => const api.AttorneyStatsDto(
                profileViews30d: 98765432,
                bidsSent30d: 1234567,
                bidsAccepted30d: 7654321,
                clientsTotal: 99999999,
              ),
            ),
          ],
          null,
          null,
        ),
        'channel post card': (
          () => Scaffold(
                body: SingleChildScrollView(
                  child: ChannelPostCard(
                    channel: channel,
                    post: longChannelPost,
                  ),
                ),
              ),
          overflowShows(find.textContaining('The landlord')),
          false,
          [
            channelsComingSoonProvider.overrideWithValue(false),
            channelsRepositoryProvider
                .overrideWithValue(ch.FakeChannelsRepository(channel: channel)),
            currentUserIdProvider.overrideWithValue('me'),
          ],
          null,
          null,
        ),
        'comments sheet': (
          () => overflowOpener(
                (c, ref) => showCommentsSheet(
                  c,
                  postId: 'p1',
                  commentsEnabled: true,
                ),
              ),
          overflowShows(find.textContaining('Bartholomew'), sheet: true),
          false,
          [],
          null,
          LongCommentsSocial(),
        ),
        'post text sheet': (
          () => overflowOpener(
                (c, ref) => showPostTextSheet(
                  c,
                  fakePost('p1').copyWith(body: longBody),
                ),
              ),
          overflowShows(find.textContaining('The landlord'), sheet: true),
          false,
          [],
          null,
          null,
        ),
      };

  for (final scale in overflowScales) {
    for (final MapEntry(key: name, value: (t, dir))
        in overflowLocales().entries) {
      group('batch 2: no overflow at 360 dp ($name, x$scale)', () {
        for (final MapEntry(
              key: label,
              value: (build, act, client, extra, repo, social),
            ) in cases().entries) {
          testWidgets(label, (tester) async {
            await pumpOverflowApp(
              tester,
              build(),
              t: t,
              dir: dir,
              scale: scale,
              client: client,
              extra: extra,
              cases: repo,
              social: social,
              act: act,
            );
          });
        }
      });
    }
  }
  for (final themeId in overflowThemes) {
    group('batch 2: themes (${themeId.name}, longest, x1.3)', () {
      for (final MapEntry(
            key: label,
            value: (build, act, client, extra, repo, social),
          ) in cases().entries) {
        testWidgets(label, (tester) async {
          await pumpOverflowApp(
            tester,
            build(),
            t: LongestTranslator(),
            dir: TextDirection.ltr,
            scale: DeviceTextScale.shellMax,
            theme: themeId,
            client: client,
            extra: extra,
            cases: repo,
            social: social,
            act: act,
          );
        });
      }
    });
  }
}
