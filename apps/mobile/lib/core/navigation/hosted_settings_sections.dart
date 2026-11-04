import 'package:flutter/widgets.dart';
import 'package:lawbid/core/navigation/deferred_screen.dart';
import 'package:lawbid/features/blocks/presentation/blocked_users_screen.dart'
    deferred as d_blocked_desktop;
import 'package:lawbid/features/cases/presentation/screens/case_history_screens.dart'
    deferred as d_case_history;
import 'package:lawbid/features/client_badge/presentation/client_badge_screen.dart'
    deferred as d_client_badge;
import 'package:lawbid/features/notifications/presentation/notification_settings_screen.dart'
    deferred as d_notifications_desktop;
import 'package:lawbid/features/partners/presentation/partner_screen.dart'
    deferred as d_partner;
import 'package:lawbid/features/plans/presentation/bid_packs_screen.dart'
    deferred as d_bid_packs;
import 'package:lawbid/features/privacy/presentation/privacy_screen.dart'
    deferred as d_privacy_desktop;
import 'package:lawbid/features/profile/presentation/screens/attorney_stats_screen.dart'
    deferred as d_stats;
import 'package:lawbid/features/profile/presentation/screens/firm_screen.dart'
    deferred as d_firm;
import 'package:lawbid/features/profile/presentation/screens/payments_hub_screen.dart'
    deferred as d_payments;
import 'package:lawbid/features/promotions/presentation/my_promotions_screen.dart'
    deferred as d_promotions;
import 'package:lawbid/features/referrals/presentation/referral_screen.dart'
    deferred as d_referral;
import 'package:lawbid/features/settings/about/about_screen.dart'
    deferred as d_about_desktop;
import 'package:lawbid/features/settings/account/presentation/screens/account_screen.dart'
    deferred as d_account_desktop;
import 'package:lawbid/features/settings/active_devices/presentation/active_devices_screen.dart'
    deferred as d_devices_desktop;
import 'package:lawbid/features/settings/archive/archive_screen.dart'
    deferred as d_archive;
import 'package:lawbid/features/settings/data_export/presentation/data_export_screen.dart'
    deferred as d_export_desktop;
import 'package:lawbid/features/settings/saved/saved_screen.dart'
    deferred as d_saved;
import 'package:lawbid/features/settings/storage/presentation/storage_screen.dart'
    deferred as d_storage_desktop;
import 'package:lawbid/features/stars/presentation/stars_screen.dart'
    deferred as d_stars;
import 'package:lawbid/features/subscription/presentation/subscription_screen.dart';
import 'package:lawbid/features/support/presentation/support_list_screen.dart'
    deferred as d_support;

/// Desktop web plan 2026-10-28 §6.7: the Settings sections the right pane
/// of the desktop Settings page hosts — route path -> the section's screen.
/// They are self-contained pages (their own bar); the query is the address's
/// query (Payments tab, Referral code). Any other row keeps
/// pushing its page. Wired here (core) so the profile feature does not
/// import the other features. Keep in step with kSettingsSectionPaths.
final Map<String, Widget Function(Map<String, String> query)>
hostedSettingsSections = {
  '/profile/settings/account': (_) => DeferredScreen(
    id: 'account_screen_desktop',
    load: d_account_desktop.loadLibrary,
    builder: (_) => d_account_desktop.AccountScreen(),
  ),
  '/profile/settings/notifications': (_) => DeferredScreen(
    id: 'notification_settings_screen_desktop',
    load: d_notifications_desktop.loadLibrary,
    builder: (_) => d_notifications_desktop.NotificationSettingsScreen(),
  ),
  '/profile/settings/privacy': (_) => DeferredScreen(
    id: 'privacy_screen_desktop',
    load: d_privacy_desktop.loadLibrary,
    builder: (_) => d_privacy_desktop.PrivacyScreen(),
  ),
  '/profile/settings/devices': (_) => DeferredScreen(
    id: 'active_devices_screen_desktop',
    load: d_devices_desktop.loadLibrary,
    builder: (_) => d_devices_desktop.ActiveDevicesScreen(),
  ),
  '/profile/settings/storage': (_) => DeferredScreen(
    id: 'storage_screen_desktop',
    load: d_storage_desktop.loadLibrary,
    builder: (_) => d_storage_desktop.StorageScreen(),
  ),
  '/profile/settings/blocked': (_) => DeferredScreen(
    id: 'blocked_users_screen_desktop',
    load: d_blocked_desktop.loadLibrary,
    builder: (_) => d_blocked_desktop.BlockedUsersScreen(),
  ),
  '/profile/settings/data-export': (_) => DeferredScreen(
    id: 'data_export_screen_desktop',
    load: d_export_desktop.loadLibrary,
    builder: (_) => d_export_desktop.DataExportScreen(),
  ),
  '/profile/settings/about': (_) => DeferredScreen(
    id: 'about_screen_desktop',
    load: d_about_desktop.loadLibrary,
    builder: (_) => d_about_desktop.AboutScreen(),
  ),
  // PR 5: the rest of the pages Settings opens.
  '/profile/settings/payments': (q) => DeferredScreen(
    id: 'payments_hub_screen_desktop',
    load: d_payments.loadLibrary,
    builder: (_) => d_payments.PaymentsHubScreen(
      initial: d_payments.PaymentsTab.parse(q['tab']),
    ),
  ),
  '/profile/settings/subscription': (_) => const SubscriptionScreen(),
  '/profile/settings/support': (_) => DeferredScreen(
    id: 'support_list_screen_desktop',
    load: d_support.loadLibrary,
    builder: (_) => d_support.SupportListScreen(),
  ),
  '/profile/settings/saved': (_) => DeferredScreen(
    id: 'saved_screen_desktop',
    load: d_saved.loadLibrary,
    builder: (_) => d_saved.SavedScreen(),
  ),
  '/profile/settings/archive': (_) => DeferredScreen(
    id: 'archive_screen_desktop',
    load: d_archive.loadLibrary,
    builder: (_) => d_archive.ArchiveScreen(),
  ),
  '/profile/settings/case-history': (_) => DeferredScreen(
    id: 'case_history_screen_desktop',
    load: d_case_history.loadLibrary,
    builder: (_) => d_case_history.CaseHistoryScreen(),
  ),
  '/profile/settings/referral': (q) => DeferredScreen(
    id: 'referral_screen_desktop',
    load: d_referral.loadLibrary,
    builder: (_) => d_referral.ReferralScreen(initialCode: q['code']),
  ),
  '/profile/settings/partner': (_) => DeferredScreen(
    id: 'partner_screen_desktop',
    load: d_partner.loadLibrary,
    builder: (_) => d_partner.PartnerScreen(),
  ),
  '/profile/settings/bid-packs': (_) => DeferredScreen(
    id: 'bid_packs_screen_desktop',
    load: d_bid_packs.loadLibrary,
    builder: (_) => d_bid_packs.BidPacksScreen(),
  ),
  '/profile/settings/stars': (_) => DeferredScreen(
    id: 'stars_screen_desktop',
    load: d_stars.loadLibrary,
    builder: (_) => d_stars.StarsScreen(),
  ),
  '/profile/settings/verify-account': (_) => DeferredScreen(
    id: 'client_badge_screen_desktop',
    load: d_client_badge.loadLibrary,
    builder: (_) => d_client_badge.ClientBadgeScreen(),
  ),
  '/profile/settings/firm': (_) => DeferredScreen(
    id: 'firm_screen_desktop',
    load: d_firm.loadLibrary,
    builder: (_) => d_firm.FirmScreen(),
  ),
  '/profile/settings/stats': (_) => DeferredScreen(
    id: 'attorney_stats_screen_desktop',
    load: d_stats.loadLibrary,
    builder: (_) => d_stats.AttorneyStatsScreen(),
  ),
  '/profile/settings/promotions': (_) => DeferredScreen(
    id: 'my_promotions_screen_desktop',
    load: d_promotions.loadLibrary,
    builder: (_) => d_promotions.MyPromotionsScreen(),
  ),
};
