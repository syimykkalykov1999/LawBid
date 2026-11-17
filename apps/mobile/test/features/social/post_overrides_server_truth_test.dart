import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/social/application/social_providers.dart';

import 'social_fakes.dart';

/// Verify 17.11: a like / repost leaves an optimistic copy of the post in
/// [postOverridesProvider]; a fresh server answer of any post list (not
/// only the feed) or of the opened post must take its place — before, the
/// copy stayed for the whole session and hid the author's edits and other
/// people's counts on profiles, tags, search and the post screen.
void main() {
  test('a profile list from the server replaces the optimistic copy',
      () async {
    final repo = FakeSocialRepository(posts: [fakePost('p1')]);
    final c = ProviderContainer(overrides: socialOverrides(repo));
    addTearDown(c.dispose);
    await c.read(socialActionsProvider).toggleRepost(fakePost('p1'));
    expect(c.read(postOverridesProvider)['p1'], isNotNull);

    // The author edits the text; other people's likes land; a reload.
    repo.posts = [fakePost('p1', likes: 7).copyWith(body: 'Edited')];
    final keep = c.listen(attorneyPostsProvider('att-1'), (_, __) {});
    addTearDown(keep.close);
    final page = await c.read(attorneyPostsProvider('att-1').future);
    expect(page.items.single.body, 'Edited');
    expect(c.read(postOverridesProvider)['p1'], isNull);
  });

  test('the opened post from the server replaces the optimistic copy',
      () async {
    final repo = FakeSocialRepository(posts: [fakePost('p1')]);
    final c = ProviderContainer(overrides: socialOverrides(repo));
    addTearDown(c.dispose);
    await c.read(socialActionsProvider).toggleRepost(fakePost('p1'));
    expect(c.read(postOverridesProvider)['p1'], isNotNull);

    repo.posts = [fakePost('p1').copyWith(body: 'Edited')];
    final keep = c.listen(postProvider('p1'), (_, __) {});
    addTearDown(keep.close);
    expect((await c.read(postProvider('p1').future)).body, 'Edited');
    expect(c.read(postOverridesProvider)['p1'], isNull);
  });
}
