import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/accessibility/reduce_motion.dart';
import 'package:lawbid/core/account_status/account_restricted.dart';
import 'package:lawbid/core/account_status/account_suspended.dart';
import 'package:lawbid/core/app_update/app_update_gate.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/available_languages.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/language_providers.dart';
import 'package:lawbid/core/l10n/material_locale.dart';
import 'package:lawbid/core/navigation/app_router.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/navigation/back_swipe.dart';
import 'package:lawbid/core/navigation/root_messenger.dart';
import 'package:lawbid/core/navigation/route_observer.dart';
import 'package:lawbid/core/navigation/system_back.dart';
import 'package:lawbid/core/permissions/permission_primer_host.dart';
import 'package:lawbid/core/platform/web_consent_notice.dart';
import 'package:lawbid/core/platform/web_safe_area.dart';
import 'package:lawbid/core/theme/preferences_sync.dart';
import 'package:lawbid/features/calls/presentation/call_host.dart';
import 'package:lawbid/features/onboarding/application/countries_providers.dart';
import 'package:lawbid/features/settings/storage/application/storage_providers.dart';

class LawBidApp extends ConsumerWidget {
  const LawBidApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Mirrors theme/language to PATCH /users/me while signed in and applies
    // the account's values after login (core/theme/preferences_sync.dart).
    ref
      ..listen(preferencesSyncProvider, (_, __) {})
      // Owner 2026-10-05: switched-on countries and their regions.
      ..listen(countriesProvider, (_, __) {});
    final router = ref.watch(appRouterProvider);
    // Owner 2026-10-22 (client economy plan §5): the cache limits are kept
    // once a day, and today's network use is counted from the start.
    ref
      ..watch(cacheEnforcerProvider)
      ..watch(networkUsageTodayProvider);
    // Owner 2026-10-13: Day, Night, Navy or Glass; never chosen = Day or
    // Night by the phone.
    final chosen = ref.watch(appThemeControllerProvider);
    final spec = chosen == null ? null : AppThemes.of(chosen);
    // Owner 2026-10-22 (checklist §17): the phone's «reduce motion» — the
    // theme's route transitions and, below, MediaQuery.disableAnimations
    // for every animated widget (core/accessibility/reduce_motion.dart).
    final still = ref.watch(reduceMotionProvider);
    final themeMode = spec == null
        ? ThemeMode.system
        : (spec.brightness == Brightness.dark
            ? ThemeMode.dark
            : ThemeMode.light);
    // Arabic, Hebrew, Persian, Urdu, Pashto: mirror the whole UI (the
    // direction below is set from the app's own list of languages).
    final language = ref.watch(languageControllerProvider).value;
    final rtl = language != null &&
        (language.isRtl ||
            (ref.watch(activeLanguagesControllerProvider) ?? const [])
                .any((l) => l.code == language.code && l.isRtl));

    return MaterialApp.router(
      scaffoldMessengerKey: rootMessengerKey,
      // "LawBid Dev" / "LawBid Staging" / "LawBid" (task switcher).
      title: ref.watch(appEnvironmentProvider).appName,
      debugShowCheckedModeBanner: false,
      theme: chosen == null
          ? AppTheme.light(reduceMotion: still)
          : AppTheme.of(chosen, reduceMotion: still),
      darkTheme: chosen == null
          ? AppTheme.dark(reduceMotion: still)
          : AppTheme.of(chosen, reduceMotion: still),
      themeMode: themeMode,
      routerConfig: router,
      // Owner 2026-10-20: the date / time dialogs and the system texts speak
      // the app's language (core/l10n/material_locale.dart).
      locale: language == null ? null : flutterLocaleFor(language),
      localizationsDelegates: appLocalizationsDelegates,
      localeResolutionCallback: keepRequestedLocale,
      // Update gate (docs/01_FOUNDATION_AUTH.md §7/§12/§15 "Этап 1.8"):
      // forced-update screen (below min_app_version_* or ANY 426
      // APP_UPDATE_REQUIRED response) and the dismissible soft-update
      // prompt — see core/app_update/app_update_gate.dart.
      // Owner 2026-09-30: a tap on empty space anywhere hides the keyboard
      // (Instagram/YouTube behaviour). Translucent: buttons and fields
      // still get their own taps first.
      // Owner 2026-10-22 (audit #12, WCAG 1.4.4): the phone's font size counts
      // up to 1.3x in the app shell (was 1.1x); chat messages and post texts
      // follow it in full (FullTextScale, design_system/widgets/text).
      builder: (context, child) => ReduceMotionScope(
        child: DeviceTextScale.shell(
          context,
          // Owner 2026-10-18: the iPhone's notch and home indicator in the
          // browser too (core/platform/web_safe_area.dart).
          child: WebSafeArea(
            child: Directionality(
              textDirection: rtl ? TextDirection.rtl : TextDirection.ltr,
              // Owner 2026-10-05: nothing ever sits under the Android system
              // navigation bar (core/design_system/widgets/bars/system_nav_band.dart).
              child: TextWarmUp(
                child: WebConsentNotice(
                  onOpenPrivacy: () =>
                      router.push(AppRoutes.legalDoc('privacy')),
                  child: AppBackdrop(
                    child: SystemNavBand(
                      child: GestureDetector(
                        behavior: HitTestBehavior.translucent,
                        onTap: dropKeyboard,
                        // Owner 2026-10-22 (audit #13): the explanation before
                        // the phone's notification / microphone dialogs.
                        child: PermissionPrimerHost(
                          child: AccountSuspendedGate(
                            child: AppUpdateGate(
                              child: child == null
                                  ? null
                                  // OQ-041: the call screen pops over any
                                  // route.
                                  : CallHost(
                                      router: router,
                                      // Owner 2026-10-21: no «connection lost»
                                      // banner for users, ever (screens keep
                                      // their cache and retry quietly).
                                      // Owner 2026-10-05 (docs/CLIENT_FRAUD.md).
                                      child: AccountRestrictedHost(
                                        router: router,
                                        // Owner 2026-10-22: system back never
                                        // closes the app from a deep screen.
                                        child: SystemBackGuard(
                                          router: router,
                                          rootNavigatorKey: appRootNavigatorKey,
                                          exitHint: () => ref
                                              .read(translatorProvider)
                                              .t('nav.backAgainToExit'),
                                          child: BackSwipeTheme(child: child),
                                        ),
                                      ),
                                    ),
                            ),
                          ),
                        ),
                      ),
                    ),
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
