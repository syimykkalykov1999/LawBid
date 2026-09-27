import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';

/// Stage 1.5 stub (file 01 §15). Real content (public/closed profile) is
/// file 3. Used to also carry a bare theme-switcher `SegmentedButton`
/// directly on this tab, as a stage-1 "переключение тем" demo — moved to
/// a proper `/profile/settings` screen (2026-09-22 owner follow-up): a
/// gear icon here, matching file 01 §3.6 ("Настройки (гамбургер)") and
/// the Instagram/TikTok pattern the owner asked for, rather than a control
/// dropped straight onto the profile tab.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);

    return Scaffold(
      appBar: AppTopBar(
        title: Text(t.t('profile.stub.title')),
        actions: [
          // UI modernization pass (2026-09-27): labelled 44x44 gear with
          // press feedback (was an unlabelled Material IconButton).
          Semantics(
            button: true,
            label: t.t('settings.title'),
            excludeSemantics: true,
            child: AppPressable(
              onTap: () => context.push(AppRoutes.profileSettings),
              child: SizedBox.square(
                dimension: AppSizes.touchTarget,
                child: Icon(
                  Icons.settings_outlined,
                  color: colors.text,
                  size: AppSizes.iconMd,
                ),
              ),
            ),
          ),
        ],
      ),
      body: AppEmptyState(
        icon: Icons.person_outline_rounded,
        message: t.t('empty.default.message'),
      ),
    );
  }
}
