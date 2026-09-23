import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/design_system/design_system.dart';
import 'core/feature_flags/feature_flags_providers.dart';
import 'core/l10n/l10n_providers.dart';
import 'core/navigation/app_router.dart';

class LawBidApp extends ConsumerWidget {
  const LawBidApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);
    final themeMode = ref.watch(themeModeControllerProvider).value ?? ThemeMode.system;

    return MaterialApp.router(
      title: 'LawBid',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode,
      routerConfig: router,
      // Force-update gate (docs/01_FOUNDATION_AUTH.md §7/§15 "Этап 1.8":
      // "поведение при APP_UPDATE_REQUIRED"). `builder` wraps the routed
      // page rather than replacing it, so this works no matter which
      // route the app is on (in particular, it still shows up over an
      // already-open session if a min-version bump happens mid-session
      // and a later bootstrap refresh picks it up) — see
      // `_UpdateRequiredGate`'s doc comment for what this covers and
      // doesn't.
      builder: (context, child) => _UpdateRequiredGate(child: child),
    );
  }
}

/// Full-screen, non-dismissible overlay shown whenever
/// `isAppUpdateRequiredProvider` is true (feature_flags_providers.dart:
/// this device's `HeadersInterceptor.appVersion` is below the
/// `min_app_version_{platform}` the last `/config/bootstrap` response
/// reported). Otherwise a transparent pass-through to [child].
///
/// Scope of this pass: the self-check is purely client-side, driven by
/// the SAME `/config/bootstrap` call `main.dart` already fires in the
/// background at cold start (and, if the app is later backgrounded and
/// resumed... nothing re-fires it — there is no lifecycle-resume hook
/// wired here, only the one cold-start call). What this does NOT cover:
/// a live 426 `APP_UPDATE_REQUIRED` response from some OTHER in-flight
/// request (docs/01_FOUNDATION_AUTH.md §7's server-side `AppVersionGuard`
/// on the backend) is not specially caught by `AuthInterceptor` and does
/// not flip this gate — that request just fails with an `ApiException`
/// the calling screen handles like any other error. Wiring that up is
/// left for a later pass (noted, not silently skipped — see
/// docs/CHANGELOG.md's stage 1.8 entry).
///
/// The "Update" button has nowhere to actually send the user yet (no
/// `url_launcher` dependency, no store listing) — same "not built yet"
/// affordance `welcome_screen.dart` already uses for its own
/// out-of-scope actions (Terms/Privacy links, the email button), rather
/// than a silently-dead button.
class _UpdateRequiredGate extends ConsumerWidget {
  const _UpdateRequiredGate({required this.child});

  final Widget? child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final updateRequired = ref.watch(isAppUpdateRequiredProvider);
    if (!updateRequired || child == null) return child ?? const SizedBox.shrink();

    final colors = Theme.of(context).extension<AppColorTokens>();
    final typography = Theme.of(context).extension<AppTypographyTokens>();
    // Theme extensions aren't resolved for the very first `builder` call
    // (before `MaterialApp` has applied `theme`/`darkTheme`) — fall back
    // to showing `child` rather than crashing on a null extension; the
    // very next rebuild (immediate, same frame tree) has them.
    if (colors == null || typography == null) return child!;
    final t = ref.watch(translatorProvider);

    return Stack(
      children: [
        child!,
        PopScope(
          canPop: false,
          child: Scaffold(
            backgroundColor: colors.bg,
            body: SafeArea(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      t.t('app.update.title'),
                      textAlign: TextAlign.center,
                      style: typography.titleLarge.copyWith(color: colors.text),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      t.t('app.update.message'),
                      textAlign: TextAlign.center,
                      style: typography.body.copyWith(color: colors.textSecondary),
                    ),
                    const SizedBox(height: 24),
                    AppButton(
                      label: t.t('app.update.button'),
                      onPressed: () {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text(t.t('auth.welcome.notBuiltYet'))),
                        );
                      },
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

