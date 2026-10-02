import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/widgets/language_picker_sheet.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/auth/application/sign_out.dart';
import 'package:lawbid/features/chat/application/presence_providers.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/settings/account/account_routes.dart';
import 'package:lawbid/features/subscription/subscription_routes.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/team_routes.dart';
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
            icon: AppIcons.personOutlineRounded,
            label: t.t('settings.account'),
            onTap: () => context.push(AccountRoutes.account),
          ),
          // docs/03 §5 (stage 3.9): confirmed contacts + contact preferences.
          AppListRow(
            icon: AppIcons.contactPhoneOutlined,
            label: t.t('contacts.title'),
            onTap: () => context.push(AppRoutes.myContacts),
          ),
          AppListRow(
            icon: AppIcons.shieldOutlined,
            label: t.t('settings.security'),
            onTap: () => context.push(AppRoutes.activeDevices),
          ),
          // docs/01 §3.6 "Подписка (адвокат)" → docs/06 §1.7 screens.
          if (ref.watch(currentUserRoleProvider) == UserRole.attorney)
            AppListRow(
              icon: AppIcons.workspacePremiumOutlined,
              label: t.t('settings.subscription'),
              onTap: () => context.push(SubscriptionRoutes.subscription),
            ),
          // Owner 2026-10-01: assistants' access lives in Settings too —
          // the Team screen (seats, every access switch, removal).
          if (ref.watch(currentUserRoleProvider) == UserRole.attorney &&
              !ref.watch(isAssistantProvider))
            AppListRow(
              key: const ValueKey('settings-assistants'),
              icon: AppIcons.adminPanelSettingsOutlined,
              label: t.t('settings.assistants'),
              subtitle: t.t('settings.assistants.hint'),
              onTap: () => context.push(TeamRoutes.team),
            ),
          AppListRow(
            icon: AppIcons.historyRounded,
            label: t.t('settings.caseHistory'),
            onTap: () => context.push(AppRoutes.caseHistory),
          ),
        ],
      ),
      AppListSection(
        title: t.t('settings.section.preferences'),
        children: [
          AppListRow(
            icon: AppIcons.languageRounded,
            label: t.t('settings.language'),
            onTap: () => LanguagePickerSheet.show(context),
          ),
          AppListRow(
            icon: AppIcons.contrastRounded,
            label: t.t('settings.theme'),
            trailingText: themeLabel(themeMode),
            onTap: () => _ThemePickerSheet.show(context),
          ),
          AppListRow(
            icon: AppIcons.notificationsNoneRounded,
            label: t.t('settings.notifications'),
            onTap: () => context.push(ChatRoutes.notificationSettings),
          ),
          // Owner 2026-10-01: online / last seen in chats (reciprocal).
          const _ActivityStatusRow(),
        ],
      ),
      AppListSection(
        title: t.t('settings.section.support'),
        children: [
          AppListRow(
            icon: AppIcons.helpOutlineRounded,
            label: t.t('settings.help'),
            onTap: showNotBuiltYet,
          ),
          AppListRow(
            icon: AppIcons.balanceRounded,
            label: t.t('settings.legal'),
            onTap: () => context.push(AppRoutes.legalDoc('terms')),
          ),
          // Owner 2026-10-02: About LawBid + the website.
          AppListRow(
            icon: AppIcons.infoOutlineRounded,
            label: t.t('about.title'),
            subtitle: t.t('about.hint'),
            onTap: () => context.push(AppRoutes.about),
          ),
          // OQ-028: who I blocked, with Unblock.
          AppListRow(
            icon: AppIcons.blockFlipped,
            label: t.t('settings.blocked'),
            onTap: () => context.push(AppRoutes.blockedUsers),
          ),
          // file 01 §10.7 → docs/06 §5.2: the background ZIP/JSON export.
          AppListRow(
            icon: AppIcons.downloadRounded,
            label: t.t('settings.downloadData'),
            onTap: () => context.push(AppRoutes.dataExport),
          ),
        ],
      ),
      AppListSection(
        title: t.t('settings.section.session'),
        children: [
          AppListRow(
            icon: AppIcons.logoutRounded,
            label: t.t('settings.logout'),
            destructive: true,
            // AppRouterGuard sends the signed-out user to /welcome.
            onTap: () => signOut(ref),
          ),
          AppListRow(
            icon: AppIcons.deleteOutlineRounded,
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
        AppIcons.smartphoneRounded
      ),
      (
        ThemeMode.light,
        t.t('settings.theme.light'),
        AppIcons.lightModeOutlined
      ),
      (ThemeMode.dark, t.t('settings.theme.dark'), AppIcons.darkModeOutlined),
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

class _ActivityStatusRow extends ConsumerWidget {
  const _ActivityStatusRow();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final value = ref.watch(activityStatusProvider);
    final on = value.value ?? true;
    return AppListRow(
      key: const ValueKey('settings-activity-status'),
      icon: AppIcons.visibilityOutlined,
      label: t.t('settings.activityStatus'),
      subtitle: t.t('settings.activityStatus.hint'),
      trailingText: value.hasValue ? t.t(on ? 'common.on' : 'common.off') : '…',
      showChevron: false,
      onTap: value.hasValue
          ? () async {
              try {
                await ref.read(activityStatusProvider.notifier).set(!on);
              } on Object catch (e) {
                if (context.mounted) {
                  showAppSnackBar(context, errorText(t, e));
                }
              }
            }
          : null,
    );
  }
}
