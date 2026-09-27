import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../design_system/design_system.dart';
import '../l10n/l10n_providers.dart';
import '../session/session_providers.dart';
import '../startup/app_startup.dart';
import 'app_update_providers.dart';

/// Opens the store listing ([storeUrlProvider]); overridable in tests.
typedef StoreLauncher = Future<bool> Function(Uri url);

final storeLauncherProvider = Provider<StoreLauncher>(
  (ref) => (url) => launchUrl(url, mode: LaunchMode.externalApplication),
);

/// Wraps the routed app (`MaterialApp.router(builder: …)`, app.dart) so the
/// update UI shows over WHATEVER route is current
/// (docs/01_FOUNDATION_AUTH.md §7, §12, §15 "Этап 1.8"):
/// - [AppUpdateStatus.updateRequired] → [ForcedUpdateScreen] on top of
///   everything, not dismissible (back is swallowed);
/// - [AppUpdateStatus.softUpdateAvailable] → [SoftUpdatePrompt] pinned to
///   the bottom, dismissible ("Later" remembers that soft version). Only
///   for a signed-in user after the splash sequence, so it never covers
///   the splash or the sign-in flow.
class AppUpdateGate extends ConsumerWidget {
  const AppUpdateGate({required this.child, super.key});

  final Widget? child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(appUpdateStatusProvider);
    final content = child ?? const SizedBox.shrink();
    // Theme extensions aren't resolved for the very first `builder` call
    // (before MaterialApp applied `theme`) — show the app as is; the next
    // rebuild (same frame tree) has them.
    final ready = Theme.of(context).extension<AppColorTokens>() != null;
    if (!ready || status == AppUpdateStatus.upToDate) return content;

    if (status == AppUpdateStatus.updateRequired) {
      return Stack(children: [content, const Positioned.fill(child: ForcedUpdateScreen())]);
    }

    // Soft prompt: only inside the app (splash finished AND signed in), so
    // the pre-app flow — welcome, sign-in, onboarding entry — never
    // changes; a forced update above still covers everything.
    final startupDone = ref.watch(appStartupProvider) == StartupStatus.ready;
    final signedIn = ref.watch(sessionControllerProvider.select((s) => s != null));
    if (!startupDone || !signedIn) return content;
    return Stack(
      children: [
        content,
        const Positioned(left: 0, right: 0, bottom: 0, child: SoftUpdatePrompt()),
      ],
    );
  }
}

Future<void> _openStore(BuildContext context, WidgetRef ref) async {
  final t = ref.read(translatorProvider);
  final url = ref.read(storeUrlProvider);
  var opened = false;
  if (url != null) {
    try {
      opened = await ref.read(storeLauncherProvider)(url);
    } catch (_) {
      opened = false;
    }
  }
  if (!opened && context.mounted) {
    showAppSnackBar(context, t.t('app.update.storeUnavailable'));
  }
}

/// Full-screen, non-dismissible "update required" screen — shown when this
/// build is below `min_app_version_{platform}` or any request returned
/// `426 APP_UPDATE_REQUIRED`.
class ForcedUpdateScreen extends ConsumerWidget {
  const ForcedUpdateScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);

    // Own Navigator-free ScaffoldMessenger: the gate sits above the
    // router's Navigator, and the snackbar must still have a host.
    return ScaffoldMessenger(
      child: PopScope(
        canPop: false,
        child: Scaffold(
          key: const Key('app_update.forced'),
          backgroundColor: colors.bg,
          body: SafeArea(
            child: LayoutBuilder(
              builder: (context, constraints) => SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: constraints.maxHeight),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Semantics(
                        header: true,
                        child: Text(
                          t.t('app.update.title'),
                          textAlign: TextAlign.center,
                          style: typography.titleLarge.copyWith(color: colors.text),
                        ),
                      ),
                      const SizedBox(height: AppSpacing.md),
                      Text(
                        t.t('app.update.message'),
                        textAlign: TextAlign.center,
                        style: typography.body.copyWith(color: colors.textSecondary),
                      ),
                      const SizedBox(height: AppSpacing.xl),
                      Builder(
                        builder: (context) => AppButton(
                          label: t.t('app.update.button'),
                          onPressed: () => _openStore(context, ref),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Dismissible "new version available" card (soft update, §12).
class SoftUpdatePrompt extends ConsumerWidget {
  const SoftUpdatePrompt({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);

    // No own ScaffoldMessenger here: the app's root one (MaterialApp) is
    // above this builder, so the "store unavailable" snackbar shows on the
    // current page's Scaffold.
    return Material(
      key: const Key('app_update.soft'),
      type: MaterialType.transparency,
      child: SafeArea(
        top: false,
        minimum: const EdgeInsets.all(AppSpacing.lg),
        child: AppCard(
          elevated: true,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Semantics(
                header: true,
                child: Text(
                  t.t('app.softUpdate.title'),
                  style: typography.titleMedium.copyWith(color: colors.text),
                ),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                t.t('app.softUpdate.message'),
                style: typography.body.copyWith(color: colors.textSecondary),
              ),
              const SizedBox(height: AppSpacing.md),
              Row(
                children: [
                  Expanded(
                    child: AppButton(
                      key: const Key('app_update.soft.later'),
                      label: t.t('app.softUpdate.later'),
                      variant: AppButtonVariant.secondary,
                      height: AppSizes.touchTarget,
                      onPressed: () {
                        final soft = ref.read(softUpdateVersionProvider);
                        if (soft != null) {
                          ref.read(softUpdateDismissalProvider.notifier).dismiss(soft);
                        }
                      },
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Builder(
                      builder: (context) => AppButton(
                        key: const Key('app_update.soft.update'),
                        label: t.t('app.softUpdate.update'),
                        height: AppSizes.touchTarget,
                        onPressed: () => _openStore(context, ref),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
