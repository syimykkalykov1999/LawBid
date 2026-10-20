import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:lawbid/core/feature_flags/default_feature_flags.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/feature_flags/feature_flags_state.dart';

/// Owner 2026-10-20: admin «Переводчик» (`chat_translate`) is off by
/// default. Tests of the translate UI switch it on (or pin it off).
class _TranslateFlags extends FeatureFlagsController {
  _TranslateFlags({required this.on});

  final bool on;

  @override
  FeatureFlagsState build() => FeatureFlagsState(
        flags: {...defaultFeatureFlags}..['chat_translate'] = on,
        appConfig: const {},
      );

  @override
  Future<void> refreshInBackground() async {}
}

List<Override> translateFlagOverrides({required bool on}) => [
      featureFlagsControllerProvider.overrideWith(
        () => _TranslateFlags(on: on),
      ),
    ];
