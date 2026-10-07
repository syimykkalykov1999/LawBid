import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:lawbid/core/feature_flags/default_feature_flags.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/feature_flags/feature_flags_state.dart';

/// Owner 2026-10-07: admin «Вход и письма по почте» (`email_login`) is off
/// by default. Tests (and goldens) of the e-mail flows switch it on.
class _EmailFlowsOnFlags extends FeatureFlagsController {
  @override
  FeatureFlagsState build() => FeatureFlagsState(
        flags: {...defaultFeatureFlags}..[kEmailFlowsFlag] = true,
        appConfig: const {},
      );

  @override
  Future<void> refreshInBackground() async {}
}

List<Override> emailFlowsOnOverrides() => [
      featureFlagsControllerProvider.overrideWith(_EmailFlowsOnFlags.new),
    ];
