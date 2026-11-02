import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/features/auth/presentation/widgets/country_waitlist_sheet.dart';
import 'package:lawbid/features/blocks/presentation/blocked_users_screen.dart';
import 'package:lawbid/features/case_payments/presentation/payout_account_screen.dart';
import 'package:lawbid/features/cases/presentation/screens/bid_form_screen.dart';
import 'package:lawbid/features/cases/presentation/screens/case_history_screens.dart';
import 'package:lawbid/features/cases/presentation/screens/invites_screen.dart';
import 'package:lawbid/features/client_badge/presentation/client_badge_screen.dart';
import 'package:lawbid/features/create/presentation/screens/create_screen.dart';
import 'package:lawbid/features/demo/presentation/demo_code_sheet.dart';
import 'package:lawbid/features/onboarding/presentation/screens/finish_onboarding_screen.dart';
import 'package:lawbid/features/plans/presentation/bid_packs_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/client_profile_edit_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/client_public_profile_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/delete_account_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/firm_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/my_contacts_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/profile_by_username_screen.dart';
import 'package:lawbid/features/promotions/presentation/my_promotions_screen.dart';
import 'package:lawbid/features/referrals/presentation/referral_screen.dart';
import 'package:lawbid/features/settings/about/about_screen.dart';
import 'package:lawbid/features/support/presentation/support_list_screen.dart';
import 'package:lawbid/features/support/presentation/support_new_screen.dart';
import 'package:lawbid/features/trust/presentation/my_trust_screen.dart';

import '../helpers/overflow_harness.dart';

/// Owner 2026-11-02: the screens no overflow test had covered yet, on a
/// 360 dp phone in the longest translation of every key, right-to-left,
/// Nepali, German, Marathi, Arabic and Russian, at text scale 1 and 1.3
/// (the shell's cap, DeviceTextScale.shellMax).
/// Any overflow fails.
void main() {
  setUpAll(initializeDateFormatting);

  final locales = overflowLocales();

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

  for (final scale in overflowScales) {
    for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
      group('leftover screens: no overflow at 360 dp ($name, x$scale)', () {
        for (final MapEntry(key: label, value: build) in screens.entries) {
          testWidgets(label, (tester) async {
            await pumpOverflowApp(
              tester,
              build(),
              t: t,
              dir: dir,
              scale: scale,
            );
          });
        }
      });
    }
  }
}
