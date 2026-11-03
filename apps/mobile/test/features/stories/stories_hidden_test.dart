import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/feature_flags/default_feature_flags.dart';
import 'package:lawbid/features/stories/application/stories_providers.dart';

void main() {
  // Owner R-049: stories (and every way to add one) are hidden by default.
  test('stories flag defaults to off and the UI switch follows it', () {
    expect(defaultFeatureFlags['stories'], isFalse);
    final container = ProviderContainer();
    addTearDown(container.dispose);
    expect(container.read(storiesEnabledProvider), isFalse);
  });
}
