import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';

import 'profile_fakes.dart';

/// Verify 17.11: a follow tap leaves «following» and the follower count in
/// [followOverridesProvider] / [followerCountsProvider]; a profile freshly
/// read from the server must win again — before, the tap's copy stayed for
/// the whole session (after a block the app still said «Вы подписаны», and
/// other people's follows never showed in the count).
void main() {
  test('a fresh attorney profile replaces the tap copy', () async {
    final profile = attorneyProfile();
    final c = ProviderContainer(
      overrides: profileOverrides(attorneys: FakeAttorneyRepo(profile: profile)),
    );
    addTearDown(c.dispose);
    c.read(followOverridesProvider.notifier).put(profile.id, true);
    c.read(followerCountsProvider.notifier).put(profile.id, 11);

    final keep = c.listen(
      publicAttorneyProfileProvider(profile.username),
      (_, __) {},
    );
    addTearDown(keep.close);
    await c.read(publicAttorneyProfileProvider(profile.username).future);

    expect(c.read(followOverridesProvider)[profile.id], isNull);
    expect(c.read(followerCountsProvider)[profile.id], isNull);
  });
}
