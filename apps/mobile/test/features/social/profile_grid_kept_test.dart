import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/social/application/social_providers.dart';

import '../../helpers/ux_harness.dart';
import 'social_fakes.dart';

/// Owner 2026-10-28: opening the own profile again shows the last grid at
/// once (no skeleton flash) and asks the server nothing more.
///
/// Owner 2026-10-28 (R-114, «на миллисекунду пустые квадраты»): a first
/// (cold) open of a profile tab shows the phone's copy of the page at once,
/// not the skeleton squares; the live page replaces it.
void main() {
  for (final (name, provider) in [
    ('Posts', attorneyPhotoPostsProvider),
    ('Reels', attorneyReelsProvider),
    ('Briefs', attorneyPostsProvider),
    ('News', attorneyNewsProvider),
  ]) {
    test('$name tab: a cold open starts on the phone copy', () async {
      final repo =
          FakeSocialRepository(posts: [fakePost('live', withPhoto: true)])
            ..profilePhoneCopy = [fakePost('copy', withPhoto: true)];
      final c = ProviderContainer(overrides: uxOverrides(social: repo));
      addTearDown(c.dispose);
      final sub = c.listen(provider('a1'), (_, __) {});
      addTearDown(sub.close);

      final first = await c.read(provider('a1').future);
      expect(first.items.map((p) => p.id), ['copy']);
      // The live page replaces the copy in the background (the fake's
      // Reels filter keeps no photo post, so that tab ends empty).
      await Future<void>.delayed(Duration.zero);
      await Future<void>.delayed(Duration.zero);
      expect(
        c.read(provider('a1')).requireValue.items.map((p) => p.id),
        name == 'Reels' ? isEmpty : ['live'],
      );
    });
  }

  test('no phone copy: the tab loads as before', () async {
    final repo =
        FakeSocialRepository(posts: [fakePost('live', withPhoto: true)]);
    final c = ProviderContainer(overrides: uxOverrides(social: repo));
    addTearDown(c.dispose);
    final first = await c.read(attorneyPhotoPostsProvider('a1').future);
    expect(first.items.map((p) => p.id), ['live']);
    expect(repo.attorneyPostsCalls, 1);
  });

  testWidgets('a profile grid is kept after its screen closes', (t) async {
    final repo = FakeSocialRepository();
    final c = ProviderContainer(overrides: uxOverrides(social: repo));
    addTearDown(c.dispose);

    final first = c.listen(attorneyPhotoPostsProvider('a1'), (_, __) {});
    await c.read(attorneyPhotoPostsProvider('a1').future);
    expect(repo.attorneyPostsCalls, 1);
    first.close();
    await t.pump(const Duration(minutes: 1));

    // The screen opens again: the rows are there at once, no new call.
    final second = c.listen(attorneyPhotoPostsProvider('a1'), (_, __) {});
    expect(second.read().hasValue, isTrue);
    expect(second.read().isLoading, isFalse);
    await t.pump();
    expect(repo.attorneyPostsCalls, 1);
    second.close();
    await t.pump(const Duration(minutes: 6));
  });
}
