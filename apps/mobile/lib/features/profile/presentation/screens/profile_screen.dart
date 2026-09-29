import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/presentation/screens/attorney_profile_screen.dart';
import 'package:lawbid/features/profile/presentation/widgets/attorney_profile_view.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/presentation/widgets/client_profile_view.dart';
import 'package:lawbid/features/profile/presentation/widgets/profile_avatar.dart';
import 'package:lawbid/features/profile/presentation/widgets/profile_handle_bar.dart';

/// Profile tab (docs/03 §8 «Профиль»): an attorney sees their own public
/// profile (§4.2, with Edit/Share and — before verification — a
/// "Complete verification" banner); a client sees the private client
/// profile (§5). The gear opens Settings (docs/01 §3.6).
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    final user = ref.watch(currentUserControllerProvider).user;
    final needsVerification = ref.watch(attorneyNeedsVerificationProvider);
    final username = user?.attorneyProfile?.username;

    final Widget body;
    if (user == null) {
      body = const AttorneyProfileSkeleton();
    } else if (user.isAttorney && username != null) {
      body = AttorneyProfileBody(username: username, needsVerification: needsVerification);
    } else if (user.isClient) {
      body = const ClientProfileView();
    } else {
      body = AppEmptyState(
        icon: Icons.person_outline_rounded,
        message: t.t('empty.default.message'),
      );
    }

    // Owner 2026-09-29: Instagram-style header — "@username" centered,
    // a small avatar left, the gear right; no "Profile" word.
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: ProfileHandleBar(
        handle: username,
        leading: SizedBox.square(
          dimension: AppSizes.touchTarget,
          child: Center(
            child: ProfileAvatar(
              size: AppSizes.iconLg + AppSpacing.xs,
              url: user?.avatarUrl,
              initials: initialsOf(user?.firstName, user?.lastName),
              semanticLabel: t.t('profile.avatar.label'),
            ),
          ),
        ),
        actions: [
          Semantics(
            button: true,
            label: t.t('settings.title'),
            excludeSemantics: true,
            child: AppPressable(
              onTap: () => context.push(AppRoutes.profileSettings),
              child: SizedBox.square(
                dimension: AppSizes.touchTarget,
                child: Icon(Icons.settings_outlined, color: colors.text, size: AppSizes.iconMd),
              ),
            ),
          ),
        ],
      ),
      body: body,
    );
  }
}
