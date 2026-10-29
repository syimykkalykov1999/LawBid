import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/social/application/social_providers.dart';

import '../../helpers/ux_harness.dart';
import 'social_fakes.dart';

/// Owner 2026-10-28: opening the own profile again shows the last grid at
/// once (no skeleton flash) and asks the server nothing more.
void main() {
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
