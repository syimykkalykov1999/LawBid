import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/account_status/account_restricted.dart';
import 'package:lawbid/core/account_status/account_suspended.dart';
import 'package:lawbid/core/app_update/app_update_gate.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/connectivity/offline_banner_host.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/available_languages.dart';
import 'package:lawbid/core/l10n/language_providers.dart';
import 'package:lawbid/core/l10n/material_locale.dart';
import 'package:lawbid/core/navigation/app_router.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/navigation/root_messenger.dart';
import 'package:lawbid/core/navigation/route_observer.dart';
import 'package:lawbid/core/platform/web_consent_notice.dart';
import 'package:lawbid/core/platform/web_safe_area.dart';
import 'package:lawbid/core/theme/preferences_sync.dart';
import 'package:lawbid/features/calls/presentation/call_host.dart';
import 'package:lawbid/features/onboarding/application/countries_providers.dart';

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
    // Owner 2026-10-13: Day, Night, Navy or Glass; never chosen = Day or
    // Night by the phone.
    final chosen = ref.watch(appThemeControllerProvider);
    final spec = chosen == null ? null : AppThemes.of(chosen);
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
      theme: chosen == null ? AppTheme.light() : AppTheme.of(chosen),
      darkTheme: chosen == null ? AppTheme.dark() : AppTheme.of(chosen),
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
      // prompt — see core/app_update/app_update_gate.dart. Inside it, the
      // global offline banner (docs/01 §8.3, p12 leaf-1.6), active only on
      // in-app routes — see core/connectivity/offline_banner_host.dart.
      // Owner 2026-09-30: a tap on empty space anywhere hides the keyboard
      // (Instagram/YouTube behaviour). Translucent: buttons and fields
      // still get their own taps first.
      builder: (context, child) => MediaQuery(
        // Owner 2026-10-14: nothing is bigger than in Instagram. The phone's
        // font-size setting still counts, but only up to 1.1x (Instagram
        // caps it the same way) so cards, sheets and warnings stay compact.
        data: MediaQuery.of(context).copyWith(
          textScaler: MediaQuery.textScalerOf(context)
              .clamp(minScaleFactor: 0.9, maxScaleFactor: 1.1),
        ),
        // Owner 2026-10-18: the iPhone's notch and home indicator in the
        // browser too (core/platform/web_safe_area.dart).
        child: WebSafeArea(
          child: Directionality(
            textDirection: rtl ? TextDirection.rtl : TextDirection.ltr,
            // Owner 2026-10-05: nothing ever sits under the Android system
            // navigation bar (core/design_system/widgets/bars/system_nav_band.dart).
            child: TextWarmUp(
              child: WebConsentNotice(
                onOpenPrivacy: () => router.push(AppRoutes.legalDoc('privacy')),
                child: AppBackdrop(
                  child: SystemNavBand(
                    child: GestureDetector(
                      behavior: HitTestBehavior.translucent,
                      onTap: dropKeyboard,
                      child: AccountSuspendedGate(
                        child: AppUpdateGate(
                          child: child == null
                              ? null
                              // OQ-041: the call screen pops over any route.
                              : CallHost(
                                  router: router,
                                  child: RouterOfflineBannerHost(
                                    router: router,
                                    // Owner 2026-10-05 (docs/CLIENT_FRAUD.md).
                                    child: AccountRestrictedHost(
                                      router: router,
                                      child: child,
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
