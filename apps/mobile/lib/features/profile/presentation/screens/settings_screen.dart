import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/widgets/language_picker_sheet.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/auth/application/sign_out.dart';
import 'package:lawbid/features/settings/account/account_routes.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/subscription/subscription_routes.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// `/profile/settings` (file 01 §3.6: "Настройки (гамбургер): Аккаунт,
/// Безопасность, Язык, Тема, Подписка (адвокат), История кейсов
/// (защищённый раздел, детали в файле 4), Уведомления, Помощь, Правовая
/// информация, Выйти, Удалить аккаунт").
///
/// 2026-09-22 owner follow-up: the theme switcher used to live directly on
/// the Profile tab stub (a bare `SegmentedButton`, stage-1.5 placeholder —
/// see `profile_screen.dart`'s git history). The owner pointed out that's
/// not how other apps do it (Instagram/TikTok: profile → gear icon →
/// settings screen), which also happens to be exactly what §3.6 specifies.
/// Moved here, plus every other §3.6 row as a stub list — only Тема and
/// Язык are wired to real controllers today. Phase 4 of the auth
/// networking work (docs/CHANGELOG.md, continuing directly after Phase 3
/// social login, commit 2bbeba5) wires Безопасность -> Active Devices
/// (`AppRoutes.activeDevices`) and Удалить аккаунт -> the delete-account
/// flow (`AppRoutes.deleteAccount`). Аккаунт, Выйти, Подписка (file 3),
/// История кейсов (file 4), and Уведомления's deeper categories (file 5)
/// still show the "not built yet" affordance already used elsewhere
/// (welcome screen's social buttons, legal docs).
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    final themeMode =
        ref.watch(themeModeControllerProvider).value ?? ThemeMode.system;

    void showNotBuiltYet() =>
        showAppSnackBar(context, t.t('auth.welcome.notBuiltYet'));

    String themeLabel(ThemeMode mode) => switch (mode) {
          ThemeMode.system => t.t('settings.theme.system'),
          ThemeMode.light => t.t('settings.theme.light'),
          ThemeMode.dark => t.t('settings.theme.dark'),
        };

    // UI modernization pass (2026-09-27): the flat §3.6 list is grouped
    // into captioned, elevated sections (same rows, same order, same
    // handlers) with icon medallions, and each section staggers in.
    final sections = <Widget>[
      AppListSection(
        title: t.t('settings.section.account'),
        children: [
          AppListRow(
            icon: Icons.person_outline_rounded,
            label: t.t('settings.account'),
            onTap: () => context.push(AccountRoutes.account),
          ),
          // docs/03 §5 (stage 3.9): confirmed contacts + contact preferences.
          AppListRow(
            icon: Icons.contact_phone_outlined,
            label: t.t('contacts.title'),
            onTap: () => context.push(AppRoutes.myContacts),
          ),
          AppListRow(
            icon: Icons.shield_outlined,
            label: t.t('settings.security'),
            onTap: () => context.push(AppRoutes.activeDevices),
          ),
          // docs/01 §3.6 "Подписка (адвокат)" → docs/06 §1.7 screens.
          if (ref.watch(currentUserRoleProvider) == UserRole.attorney)
            AppListRow(
              icon: Icons.workspace_premium_outlined,
              label: t.t('settings.subscription'),
              onTap: () => context.push(SubscriptionRoutes.subscription),
            ),
          AppListRow(
            icon: Icons.history_rounded,
            label: t.t('settings.caseHistory'),
            onTap: () => context.push(AppRoutes.caseHistory),
          ),
        ],
      ),
      AppListSection(
        title: t.t('settings.section.preferences'),
        children: [
          AppListRow(
            icon: Icons.language_rounded,
            label: t.t('settings.language'),
            onTap: () => LanguagePickerSheet.show(context),
          ),
          AppListRow(
            icon: Icons.contrast_rounded,
            label: t.t('settings.theme'),
            trailingText: themeLabel(themeMode),
            onTap: () => _ThemePickerSheet.show(context),
          ),
          AppListRow(
            icon: Icons.notifications_none_rounded,
            label: t.t('settings.notifications'),
            onTap: () => context.push(ChatRoutes.notificationSettings),
          ),
        ],
      ),
      AppListSection(
        title: t.t('settings.section.support'),
        children: [
          AppListRow(
            icon: Icons.help_outline_rounded,
            label: t.t('settings.help'),
            onTap: showNotBuiltYet,
          ),
          AppListRow(
            icon: Icons.balance_rounded,
            label: t.t('settings.legal'),
            onTap: () => context.push(AppRoutes.legalDoc('terms')),
          ),
          // file 01 §10.7 / §15 stage 1.7: "«Скачать мои данные»
          // (заглушка на этом этапе, полная реализация в файле 6)".
          // TODO(file 06 §data-export): request the background ZIP/JSON
          // export and email the link.
          AppListRow(
            icon: Icons.download_rounded,
            label: t.t('settings.downloadData'),
            onTap: () =>
                showAppSnackBar(context, t.t('settings.downloadData.stub')),
          ),
        ],
      ),
      AppListSection(
        title: t.t('settings.section.session'),
        children: [
          AppListRow(
            icon: Icons.logout_rounded,
            label: t.t('settings.logout'),
            destructive: true,
            // AppRouterGuard sends the signed-out user to /welcome.
            onTap: () => signOut(ref),
          ),
          AppListRow(
            icon: Icons.delete_outline_rounded,
            label: t.t('settings.deleteAccount'),
            destructive: true,
            onTap: () => context.push(AppRoutes.deleteAccount),
          ),
        ],
      ),
    ];

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('settings.title')),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SafeArea(
        top: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.sm,
            AppSpacing.screenSide,
            AppSpacing.xxl,
          ),
          children: [
            for (var i = 0; i < sections.length; i++) ...[
              if (i > 0) const SizedBox(height: AppSpacing.section),
              AppEntrance(index: i, child: sections[i]),
            ],
          ],
        ),
      ),
    );
  }
}

/// Theme picker (file 01 §8.1: "Системная / Светлая / Тёмная") — a small
/// bottom sheet rather than the welcome screen's single quick-toggle icon
/// button, since here all 3 [ThemeMode] values need a home, not just a
/// light<->dark shortcut.
class _ThemePickerSheet extends ConsumerWidget {
  const _ThemePickerSheet();

  static Future<void> show(BuildContext context) {
    return showAppBottomSheet<void>(
      context: context,
      builder: (_) => const _ThemePickerSheet(),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final current =
        ref.watch(themeModeControllerProvider).value ?? ThemeMode.system;

    final options = <(ThemeMode, String, IconData)>[
      (
        ThemeMode.system,
        t.t('settings.theme.system'),
        Icons.smartphone_rounded
      ),
      (ThemeMode.light, t.t('settings.theme.light'), Icons.light_mode_outlined),
      (ThemeMode.dark, t.t('settings.theme.dark'), Icons.dark_mode_outlined),
    ];

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.md,
          AppSpacing.screenSide,
          AppSpacing.lg,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const AppSheetHandle(),
            Semantics(
              header: true,
              child: Text(
                t.t('settings.theme'),
                style: typography.titleMedium.copyWith(color: colors.text),
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            for (var i = 0; i < options.length; i++) ...[
              if (i > 0) const SizedBox(height: AppSpacing.xs),
              AppEntrance(
                index: i,
                child: AppListRow(
                  icon: options[i].$3,
                  label: options[i].$2,
                  selected: options[i].$1 == current,
                  showChevron: false,
                  onTap: () {
                    ref
                        .read(themeModeControllerProvider.notifier)
                        .setThemeMode(options[i].$1);
                    Navigator.of(context).pop();
                  },
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
