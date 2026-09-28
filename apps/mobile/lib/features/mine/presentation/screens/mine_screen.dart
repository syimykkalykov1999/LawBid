import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/presentation/screens/verification_required_screen.dart';

/// Stage 1.5 stub (file 01 §15). Real content (Мои кейсы/биды, Сохранённое)
/// is file 4.
///
/// docs/03 §1 / §6.1 (stage 3.9): an attorney whose verification status is
/// not `verified` (unverified / pending / rejected / suspended) sees the
/// "Complete verification" gate here instead of the (future) cases list.
class MineScreen extends ConsumerWidget {
  const MineScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final needsVerification = ref.watch(attorneyNeedsVerificationProvider);

    return Scaffold(
      appBar: AppTopBar(title: Text(t.t('mine.stub.title'))),
      body: needsVerification
          ? const VerificationRequiredView(reason: VerificationGateReason.cases)
          : AppEmptyState(
              icon: Icons.folder_open_rounded,
              message: t.t('empty.default.message'),
            ),
    );
  }
}
