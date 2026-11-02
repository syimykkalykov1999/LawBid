import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/session/session_state.dart';
import 'package:lawbid/features/auth/presentation/widgets/country_waitlist_sheet.dart';
import 'package:lawbid/features/cases/presentation/screens/bid_form_screen.dart';
import 'package:lawbid/features/cases/presentation/screens/case_history_screens.dart';
import 'package:lawbid/features/create/presentation/screens/create_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/finish_onboarding_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/client_profile_edit_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/client_public_profile_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/profile_by_username_screen.dart';
import 'package:lawbid/features/blocks/presentation/blocked_users_screen.dart';
import 'package:lawbid/features/case_payments/presentation/payout_account_screen.dart';
import 'package:lawbid/features/cases/presentation/screens/invites_screen.dart';
import 'package:lawbid/features/client_badge/presentation/client_badge_screen.dart';
import 'package:lawbid/features/demo/presentation/demo_code_sheet.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/plans/presentation/bid_packs_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/delete_account_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/firm_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/my_contacts_screen.dart';
import 'package:lawbid/features/promotions/presentation/my_promotions_screen.dart';
import 'package:lawbid/features/referrals/presentation/referral_screen.dart';
import 'package:lawbid/features/settings/about/about_screen.dart';
import 'package:lawbid/features/support/presentation/support_list_screen.dart';
import 'package:lawbid/features/support/presentation/support_new_screen.dart';
import 'package:lawbid/features/trust/presentation/my_trust_screen.dart';

import '../features/profile/profile_fakes.dart';
import '../helpers/long_locale.dart';
import '../helpers/onboarding_harness.dart' show FixedUserController;
import '../helpers/referral_overrides.dart';
import '../helpers/ux_harness.dart';

/// Owner 2026-11-02: the screens no overflow test had covered yet, on a
/// 360 dp phone in the longest translation of every key, right-to-left,
/// Nepali, German, Marathi, Arabic and Russian, at text scale 1 and 1.3
/// (the shell's cap, DeviceTextScale.shellMax).
/// Any overflow fails.
class _Session extends SessionController {
  @override
  SessionState? build() => SessionState(
        accessToken: 'at',
        sub: 'user-1',
        role: 'attorney',
        sid: 's1',
        verified: true,
        subscriptionStatus: 'none',
        accessTokenExpiresAt: DateTime.utc(2030),
      );
}

void main() {
  setUpAll(initializeDateFormatting);

  late SharedPreferences prefs;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
  });

  final locales = <String, (Translator, TextDirection)>{
    'longest of all languages': (LongestTranslator(), TextDirection.ltr),
    'longest, right-to-left': (LongestTranslator(), TextDirection.rtl),
    'ne': (ShippedTranslator('ne'), TextDirection.ltr),
    'ar': (ShippedTranslator('ar'), TextDirection.rtl),
    'de': (ShippedTranslator('de'), TextDirection.ltr),
    'mr': (ShippedTranslator('mr'), TextDirection.ltr),
    'ru': (
      L10nTranslator(language: AppLanguage.ru, cache: const {}),
      TextDirection.ltr,
    ),
  };

  final screens = <String, Widget Function()>{
    'bid packs': () => const BidPacksScreen(),
    'referral': () => const ReferralScreen(),
    'about': () => const AboutScreen(),
    'delete account': () => const DeleteAccountScreen(),
    'blocked users': () => const BlockedUsersScreen(),
    'my trust': () => const MyTrustScreen(),
    'support new': () => const SupportNewScreen(),
    'support list': () => const SupportListScreen(),
    'demo code': () => const Scaffold(body: DemoCodeSheet()),
    'my promotions': () => const MyPromotionsScreen(),
    'firm': () => const FirmScreen(),
    'my contacts': () => const MyContactsScreen(),
    'invites': () => const InvitesScreen(),
    'client badge': () => const ClientBadgeScreen(),
    'payout account': () => const PayoutAccountScreen(),
    'bid form': () => const BidFormScreen(
          caseId: 'c1',
          initialAmountCents: 99999999999,
        ),
    'case history': () => const CaseHistoryScreen(),
    'create (attorney)': () => const CreateScreen(),
    'create case': () => const CreateScreen(startWithCase: true),
    'finish onboarding': () => const FinishOnboardingScreen(),
    'client profile edit': () => const ClientProfileEditScreen(),
    'client public profile': () => const ClientPublicProfileScreen(
          username: 'a_really_long_username_number_1',
        ),
    'profile by username': () => const ProfileByUsernameScreen(
          username: 'a_really_long_username_number_1',
        ),
    'country waitlist': () =>
        const Scaffold(body: CountryWaitlistSheet(countryCode: 'DE')),
  };

  for (final scale in [1.0, 1.3]) {
    for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
      group('leftover screens: no overflow at 360 dp ($name, x$scale)', () {
        for (final MapEntry(key: label, value: build) in screens.entries) {
          testWidgets(label, (tester) async {
            useNarrowPhone(tester);
            final overrides = <Override>[
              ...uxOverrides(translator: t),
              sharedPreferencesProvider.overrideWithValue(prefs),
              referralOffOverride,
              partnerOffOverride,
              templatesOffOverride,
              sessionControllerProvider.overrideWith(_Session.new),
              currentUserControllerProvider.overrideWith(
                () => FixedUserController(
                  CurrentUserState.ready(attorneyMe()),
                ),
              ),
            ];
            await tester.pumpWidget(
              ProviderScope(
                overrides: overrides,
                child: MaterialApp(
                  debugShowCheckedModeBanner: false,
                  theme: AppTheme.light(),
                  builder: (context, child) => Directionality(
                    textDirection: dir,
                    child: MediaQuery(
                      data: MediaQuery.of(context).copyWith(
                        textScaler: TextScaler.linear(scale),
                        disableAnimations: false,
                      ),
                      child: child!,
                    ),
                  ),
                  home: build(),
                ),
              ),
            );
            await tester.pump();
            await tester.pump(const Duration(milliseconds: 500));
            expect(tester.takeException(), isNull);
            await tester.pumpWidget(const SizedBox());
            await tester.pump(const Duration(minutes: 5));
          });
        }
      });
    }
  }
}
