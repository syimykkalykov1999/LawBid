import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/feature_flags/feature_flags_state.dart';
import 'package:lawbid/features/reels/application/video_limits.dart';

FeatureFlagsState _flags(Map<String, String> config) =>
    FeatureFlagsState(flags: const {}, appConfig: config);

void main() {
  test('the new reel key wins, then the old single key, then 180', () {
    expect(reelMaxSecondsOf(_flags({})), 180);
    expect(
      reelMaxSecondsOf(_flags({'video.max_duration_sec': '100'})),
      100,
    );
    expect(
      reelMaxSecondsOf(
        _flags({
          'video.max_duration_sec': '100',
          'video.reel_max_duration_sec': '120',
        }),
      ),
      120,
    );
  });
}
