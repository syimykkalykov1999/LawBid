import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/presentation/widgets/profile_trust_widgets.dart';
import 'package:lawbid/features/social/application/social_drafts.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Owner rows 109 / 112: drafts, «Not interested», response time and the
/// profile completeness logic.
void main() {
  late SharedPreferences prefs;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
  });

  ProviderContainer make(String user) => ProviderContainer(
        overrides: [
          sharedPreferencesProvider.overrideWithValue(prefs),
          currentUserIdProvider.overrideWithValue(user),
        ],
      );

  test('a saved post draft comes back for the same account only', () async {
    final a = make('u1');
    addTearDown(a.dispose);
    await a.read(postComposeDraftsProvider).save(
          const PostComposeDraft(body: 'Hello', place: 'Reno', practice: 'x'),
        );
    final d = a.read(postComposeDraftsProvider).load();
    expect(d?.body, 'Hello');
    expect(d?.place, 'Reno');
    expect(d?.practice, 'x');
    final b = make('u2');
    addTearDown(b.dispose);
    expect(b.read(postComposeDraftsProvider).load(), isNull);
    await a.read(postComposeDraftsProvider).clear();
    expect(a.read(postComposeDraftsProvider).load(), isNull);
  });

  test('an empty draft is never stored', () async {
    final a = make('u1');
    addTearDown(a.dispose);
    await a.read(postComposeDraftsProvider).save(const PostComposeDraft());
    expect(a.read(postComposeDraftsProvider).load(), isNull);
  });

  test('comment drafts live per post; a blank text drops one', () {
    final a = make('u1');
    addTearDown(a.dispose);
    final drafts = a.read(commentDraftsProvider.notifier)
      ..set('p1', 'half typed')
      ..set('p2', 'other');
    expect(drafts.of('p1'), 'half typed');
    drafts.set('p1', '  ');
    expect(drafts.of('p1'), isNull);
    expect(drafts.of('p2'), 'other');
  });

  test(
      '«Not interested» hides the post in every list, survives a restart, '
      'and undo brings it back', () {
    final a = make('u1');
    addTearDown(a.dispose);
    a.read(notInterestedPostsProvider.notifier).add('post-1');
    expect(a.read(deletedPostsProvider), contains('post-1'));
    final restarted = make('u1');
    addTearDown(restarted.dispose);
    expect(restarted.read(deletedPostsProvider), contains('post-1'));
    restarted.read(notInterestedPostsProvider.notifier).remove('post-1');
    expect(restarted.read(deletedPostsProvider), isNot(contains('post-1')));
  });

  test('response time follows the Airbnb steps', () {
    expect(replyTimeKey(5), 'profile.reply.hour');
    expect(replyTimeKey(60), 'profile.reply.hour');
    expect(replyTimeKey(61), 'profile.reply.hours');
    expect(replyTimeKey(360), 'profile.reply.hours');
    expect(replyTimeKey(361), 'profile.reply.day');
    expect(replyTimeKey(1440), 'profile.reply.day');
    expect(replyTimeKey(1441), 'profile.reply.days');
  });

  test('completeness lists what is missing, in order', () {
    const empty = PublicAttorneyProfile(
      id: 'a',
      username: 'a',
      verifiedBadge: false,
      rating: RatingInfo(average: null, count: 0),
      isSelf: true,
    );
    expect(missingParts(empty), ProfilePart.values);
    const full = PublicAttorneyProfile(
      id: 'a',
      username: 'a',
      verifiedBadge: false,
      rating: RatingInfo(average: null, count: 0),
      isSelf: true,
      avatarUrl: 'https://x/y.jpg',
      bio: 'Bio',
      languages: ['en'],
      firms: ['Firm'],
      practices: [
        SelectedPractice(
          id: '1',
          i18nKey: 'k',
          nameEn: 'n',
          categoryId: 'c',
          categoryI18nKey: 'ck',
        ),
      ],
    );
    expect(missingParts(full), isEmpty);
  });

  testWidgets('the leave sheet answers save / discard / stay', (t) async {
    late BuildContext ctx;
    await t.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Builder(
          builder: (c) {
            ctx = c;
            return const Scaffold();
          },
        ),
      ),
    );
    Future<LeaveChoice> open() => showLeaveSheet(
          ctx,
          title: 'Save draft?',
          message: 'm',
          saveLabel: 'Save draft',
          discardLabel: 'Discard',
          stayLabel: 'Keep editing',
        );
    for (final (key, want) in [
      ('leave-save', LeaveChoice.save),
      ('leave-discard', LeaveChoice.discard),
      ('leave-stay', LeaveChoice.stay),
    ]) {
      final f = open();
      await t.pumpAndSettle();
      await t.tap(find.byKey(ValueKey(key)));
      await t.pumpAndSettle();
      expect(await f, want);
    }
  });

  testWidgets('the sticky bar is built only while shown', (t) async {
    Future<void> pump({required bool visible}) => t.pumpWidget(
          MaterialApp(
            theme: AppTheme.light(),
            home: Scaffold(
              body: ProfileStickyCta(
                visible: visible,
                messageLabel: 'Message',
                onMessage: () {},
                bookLabel: 'Book',
                onBook: () {},
              ),
            ),
          ),
        );
    await pump(visible: false);
    expect(find.byKey(const ValueKey('profile-sticky-cta')), findsNothing);
    await pump(visible: true);
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('profile-sticky-message')), findsOne);
    expect(find.byKey(const ValueKey('profile-sticky-book')), findsOne);
  });
}
