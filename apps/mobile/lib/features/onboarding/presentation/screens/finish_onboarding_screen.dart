import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/onboarding/application/onboarding_actions.dart';

/// `/onboarding/push` and `/onboarding/tour` no longer have a screen (owner
/// 2026-10-11). An account whose saved step is one of them (an older
/// build) finishes onboarding right here and moves on to the feed.
class FinishOnboardingScreen extends ConsumerStatefulWidget {
  const FinishOnboardingScreen({super.key});

  @override
  ConsumerState<FinishOnboardingScreen> createState() =>
      _FinishOnboardingScreenState();
}

class _FinishOnboardingScreenState
    extends ConsumerState<FinishOnboardingScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(ref.read(onboardingActionsProvider.notifier).complete());
    });
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Padding(
        padding: EdgeInsets.all(AppSpacing.screenSide),
        child: AppSkeletonCard(),
      ),
    );
  }
}
