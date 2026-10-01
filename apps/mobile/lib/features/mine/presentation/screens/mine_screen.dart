import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/presentation/screens/mine_views.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/presentation/screens/verification_required_screen.dart';
import 'package:lawbid/features/team/application/team_providers.dart';

/// "Моё" (docs/04 §11): clients get "Мои кейсы" / "Сохранённое",
/// attorneys "Мои биды" / "В работе" / "Сохранённое".
///
/// docs/03 §1 / §6.1 (stage 3.9): an attorney whose verification status is
/// not `verified` (unverified / pending / rejected / suspended) sees the
/// "Complete verification" gate here instead of the (future) cases list.
///
/// Owner 2026-09-29: no "Mine" title bar — the tabs start at the top.
class MineScreen extends ConsumerWidget {
  const MineScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final needsVerification = ref.watch(attorneyNeedsVerificationProvider);

    final attorney = ref.watch(actsAsAttorneyProvider);

    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        bottom: false,
        child: needsVerification
            ? const VerificationRequiredView(
                reason: VerificationGateReason.cases,
              )
            : attorney
                ? const AttorneyMineView()
                : const ClientMineView(),
      ),
    );
  }
}
