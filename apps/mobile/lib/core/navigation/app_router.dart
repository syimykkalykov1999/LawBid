import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/deeplinks/deep_link_routes.dart';
import 'package:lawbid/core/diagnostics/app_events.dart';
import 'package:lawbid/core/diagnostics/crash_reporter.dart';
import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/navigation/deferred_screen.dart';
import 'package:lawbid/core/navigation/guards/app_router_guard.dart';
import 'package:lawbid/core/navigation/route_observer.dart';
import 'package:lawbid/core/navigation/shell/main_shell.dart';
import 'package:lawbid/core/session/guest_mode.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/startup/app_startup.dart';
import 'package:lawbid/features/auth/auth_routes.dart';
import 'package:lawbid/features/blocks/presentation/blocked_users_screen.dart'
    deferred as d_blocked_users_screen;
import 'package:lawbid/features/case_payments/case_payments_routes.dart';
import 'package:lawbid/features/cases/deals/deal_record_screen.dart'
    deferred as d_deal_record_screen;
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/screens/bid_detail_screen.dart'
    deferred as d_bid_detail_screen;
import 'package:lawbid/features/cases/presentation/screens/bid_form_screen.dart'
    deferred as d_bid_form_screen;
import 'package:lawbid/features/cases/presentation/screens/case_comments_screen.dart'
    deferred as d_case_comments_screen;
import 'package:lawbid/features/cases/presentation/screens/case_history_screens.dart'
    deferred as d_case_history_screens;
import 'package:lawbid/features/cases/presentation/screens/edit_case_screen.dart'
    deferred as d_edit_case_screen;
import 'package:lawbid/features/cases/presentation/screens/invites_screen.dart'
    deferred as d_invites_screen;
import 'package:lawbid/features/cases/presentation/screens/mine_views.dart';
import 'package:lawbid/features/cases/presentation/screens/owner_case_screen.dart';
import 'package:lawbid/features/cases/presentation/screens/work_case_screen.dart'
    deferred as d_work_case_screen;
import 'package:lawbid/features/channels/channels_routes.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/client_badge/presentation/client_badge_screen.dart'
    deferred as d_client_badge_screen;
import 'package:lawbid/features/client_plan/client_plan_routes.dart';
import 'package:lawbid/features/consultations/consultations_routes.dart';
import 'package:lawbid/features/contacts_sync/presentation/contacts_screen.dart'
    deferred as d_contacts_screen;
import 'package:lawbid/features/create/presentation/screens/create_screen.dart';
import 'package:lawbid/features/deadlines/deadlines_routes.dart';
import 'package:lawbid/features/feed/presentation/screens/feed_screen.dart';
import 'package:lawbid/features/groups/group_router.dart';
import 'package:lawbid/features/legal/presentation/dmca_notice_screen.dart'
    deferred as d_dmca_notice_screen;
import 'package:lawbid/features/legal/presentation/legal_accept_screen.dart';
import 'package:lawbid/features/legal_qa/legal_qa_routes.dart';
import 'package:lawbid/features/mine/presentation/screens/mine_screen.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/onboarding_routes.dart';
import 'package:lawbid/features/onboarding/presentation/screens/legal_document_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/splash_screen.dart';
import 'package:lawbid/features/partners/presentation/partner_screen.dart'
    deferred as d_partner_screen;
import 'package:lawbid/features/plans/presentation/bid_packs_screen.dart'
    deferred as d_bid_packs_screen;
import 'package:lawbid/features/privacy/privacy_routes.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/presentation/screens/attorney_stats_screen.dart'
    deferred as d_attorney_stats_screen;
import 'package:lawbid/features/profile/presentation/screens/client_profile_edit_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/delete_account_screen.dart'
    deferred as d_delete_account_screen;
import 'package:lawbid/features/profile/presentation/screens/firm_screen.dart'
    deferred as d_firm_screen;
import 'package:lawbid/features/profile/presentation/screens/my_contacts_screen.dart'
    deferred as d_my_contacts_screen;
import 'package:lawbid/features/profile/presentation/screens/payments_hub_screen.dart'
    deferred as d_payments_hub_screen;
import 'package:lawbid/features/profile/presentation/screens/practices_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/profile_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/review_form_screen.dart'
    deferred as d_review_form_screen;
import 'package:lawbid/features/profile/presentation/screens/settings_screen.dart'
    deferred as d_settings_screen;
import 'package:lawbid/features/profile/presentation/screens/verification_required_screen.dart';
import 'package:lawbid/features/promotions/presentation/my_promotions_screen.dart'
    deferred as d_my_promotions_screen;
import 'package:lawbid/features/promotions/presentation/promotion_stats_screen.dart'
    deferred as d_promotion_stats_screen;
import 'package:lawbid/features/qr/presentation/my_qr_screen.dart'
    deferred as d_my_qr_screen;
import 'package:lawbid/features/qr/presentation/qr_scanner_screen.dart'
    deferred as d_qr_scanner_screen;
import 'package:lawbid/features/referrals/presentation/referral_screen.dart'
    deferred as d_referral_screen;
import 'package:lawbid/features/search/presentation/screens/search_screen.dart';
import 'package:lawbid/features/settings/about/about_screen.dart'
    deferred as d_about_screen;
import 'package:lawbid/features/settings/account/account_routes.dart';
import 'package:lawbid/features/settings/active_devices/presentation/active_devices_screen.dart'
    deferred as d_active_devices_screen;
import 'package:lawbid/features/settings/archive/archive_screen.dart'
    deferred as d_archive_screen;
import 'package:lawbid/features/settings/data_export/presentation/data_export_screen.dart'
    deferred as d_data_export_screen;
import 'package:lawbid/features/settings/saved/saved_screen.dart'
    deferred as d_saved_screen;
import 'package:lawbid/features/settings/storage/presentation/storage_screen.dart'
    deferred as d_storage_screen;
import 'package:lawbid/features/social/social_routes.dart';
import 'package:lawbid/features/stars/presentation/my_gifts_screen.dart'
    deferred as d_my_gifts_screen;
import 'package:lawbid/features/stars/presentation/stars_screen.dart'
    deferred as d_stars_screen;
import 'package:lawbid/features/stories/stories_routes.dart';
import 'package:lawbid/features/subscription/subscription_routes.dart';
import 'package:lawbid/features/support/presentation/support_list_screen.dart'
    deferred as d_support_list_screen;
import 'package:lawbid/features/support/presentation/support_new_screen.dart'
    deferred as d_support_new_screen;
import 'package:lawbid/features/support/presentation/support_ticket_screen.dart'
    deferred as d_support_ticket_screen;
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/team_routes.dart';
import 'package:lawbid/features/templates/presentation/templates_screen.dart';
import 'package:lawbid/features/trust/trust_routes.dart';
import 'package:lawbid/features/verification/presentation/screens/verification_status_screen.dart'
    deferred as d_verification_status_screen;
import 'package:lawbid/features/verification/presentation/screens/verification_wizard_screen.dart'
    deferred as d_verification_wizard_screen;
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'app_router.g.dart';

/// App-wide router (file 01 §5.1: go_router + ShellRoute; stage 1.5 uses
/// `StatefulShellRoute.indexedStack` — see main_shell.dart doc comment).
///
/// Stage 1.7 mobile: starts on [AppRoutes.splash] (§10.2 A) and delegates
/// EVERY redirect to [AppRouterGuard] (§11). [_GuardRefresh] re-runs the
/// guard whenever the startup status, the session, or `GET /users/me`
/// changes — so onboarding screens only mutate server state and the guard
/// moves the user to the next step (no navigation logic in screens).
@riverpod
GoRouter appRouter(Ref ref) {
  final refresh = _GuardRefresh(ref);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: AppRoutes.splash,
    // Owner 2026-10-15 (web): a typed or shared address (/lawyer/anna) first
    // goes through the splash like every start; DeepLinkController opens it
    // right after (and after sign-in).
    overridePlatformDefaultLocation: kIsWeb,
    observers: [routeObserver, UnfocusOnNavigateObserver()],
    refreshListenable: refresh,
    redirect: (context, state) {
      CrashReporter.setRoute(state.matchedLocation);
      AppEvents.screen(state.matchedLocation);
      final returnTo = ref.read(guestReturnProvider);
      final target = AppRouterGuard.redirect(
        state.matchedLocation,
        GuardSnapshot(
          startup: ref.read(appStartupProvider),
          hasSession: ref.read(sessionControllerProvider) != null,
          user: ref.read(currentUserControllerProvider),
          assistant: _assistantGate(ref),
          guestBrowsing: ref.read(guestBrowsingEnabledProvider),
          returnTo: returnTo,
        ),
      );
      // The guest's remembered screen is used once (after sign-in), then
      // forgotten — also when the person lands on it by themselves.
      if (returnTo != null &&
          (target == returnTo ||
              (target == null && state.matchedLocation == returnTo))) {
        ref.read(guestReturnProvider.notifier).clear();
      }
      return target;
    },
    routes: [
      GoRoute(
        path: AppRoutes.splash,
        pageBuilder: (context, state) =>
            AppPageTransitions.fade(state, const SplashScreen()),
      ),
      StatefulShellRoute.indexedStack(
        // UI modernization pass (2026-09-27): the shell fades in when the
        // user lands on it (e.g. role → feed); see app_page_transitions.dart.
        pageBuilder: (context, state, navigationShell) =>
            AppPageTransitions.fade(
          state,
          MainShell(navigationShell: navigationShell),
        ),
        branches: [
          StatefulShellBranch(
            observers: [UnfocusOnNavigateObserver()],
            routes: [
              GoRoute(
                path: AppRoutes.feed,
                builder: (context, state) => const FeedScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            observers: [UnfocusOnNavigateObserver()],
            routes: [
              GoRoute(
                path: AppRoutes.search,
                builder: (context, state) => const SearchScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            observers: [UnfocusOnNavigateObserver()],
            routes: [
              GoRoute(
                path: AppRoutes.mine,
                builder: (context, state) => const MineScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            observers: [UnfocusOnNavigateObserver()],
            routes: [
              GoRoute(
                path: AppRoutes.profile,
                builder: (context, state) => const ProfileScreen(),
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: AppRoutes.create,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.modal(
          state,
          CreateScreen(
            startWithCase: state.uri.queryParameters['kind'] == 'case',
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.profileSettings,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'settings_screen',
            load: d_settings_screen.loadLibrary,
            builder: (_) => d_settings_screen.SettingsScreen(),
          ),
        ),
      ),
      // Phase 4 of the auth networking work (docs/CHANGELOG.md) — pushed
      // on the ROOT navigator, same reasoning as profileSettings above.
      GoRoute(
        path: AppRoutes.activeDevices,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'active_devices_screen',
            load: d_active_devices_screen.loadLibrary,
            builder: (_) => d_active_devices_screen.ActiveDevicesScreen(),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.deleteAccount,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'delete_account_screen',
            load: d_delete_account_screen.loadLibrary,
            builder: (_) => d_delete_account_screen.DeleteAccountScreen(),
          ),
        ),
      ),
      // docs/03 stage 3.9 — practices, profile editing, contacts, reviews,
      // and the "+" → Post to feed verification gate.
      GoRoute(
        path: AppRoutes.profileEdit,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const ProfileEditScreen()),
      ),
      GoRoute(
        path: AppRoutes.practices,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const PracticesScreen()),
      ),
      GoRoute(
        path: AppRoutes.myContacts,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'my_contacts_screen',
            load: d_my_contacts_screen.loadLibrary,
            builder: (_) => d_my_contacts_screen.MyContactsScreen(),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.reviewForm,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'review_form_screen',
            load: d_review_form_screen.loadLibrary,
            builder: (_) => d_review_form_screen.ReviewFormScreen(
              caseId: state.pathParameters['caseId'] ?? '',
              existing: state.extra is Review ? state.extra! as Review : null,
            ),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.verificationRequired,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) =>
            AppPageTransitions.modal(state, const VerificationRequiredScreen()),
      ),
      GoRoute(
        path: AppRoutes.verification,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'verification_status_screen',
            load: d_verification_status_screen.loadLibrary,
            builder: (_) =>
                d_verification_status_screen.VerificationStatusScreen(),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.verificationWizard,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'verification_wizard_screen',
            load: d_verification_wizard_screen.loadLibrary,
            builder: (_) =>
                d_verification_wizard_screen.VerificationWizardScreen(),
          ),
        ),
      ),
      // Owner 2026-10-05 (legal documents): accept the documents of my role.
      GoRoute(
        path: AppRoutes.legalAccept,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) =>
            AppPageTransitions.modal(state, const LegalAcceptScreen()),
      ),
      // Owner 2026-10-05 (legal): before `/legal/:docType` — first match wins.
      GoRoute(
        path: AppRoutes.dmcaNotice,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'dmca_notice_screen',
            load: d_dmca_notice_screen.loadLibrary,
            builder: (_) => d_dmca_notice_screen.DmcaNoticeScreen(
              targetType: state.uri.queryParameters['targetType'],
              targetId: state.uri.queryParameters['targetId'],
            ),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.legal,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.modal(
          state,
          LegalDocumentScreen(docType: state.pathParameters['docType'] ?? ''),
        ),
      ),
      // docs/04 cases & bids (stages 4.9/4.10) — ROOT navigator.
      GoRoute(
        path: AppRoutes.myCasePattern,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          OwnerCaseScreen(caseId: state.pathParameters['id'] ?? ''),
        ),
      ),
      GoRoute(
        path: AppRoutes.myCaseEditPattern,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'edit_case_screen',
            load: d_edit_case_screen.loadLibrary,
            builder: (_) => d_edit_case_screen.EditCaseScreen(
              caseId: state.pathParameters['id'] ?? '',
            ),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.dealRecordPattern,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'deal_record_screen',
            load: d_deal_record_screen.loadLibrary,
            builder: (_) => d_deal_record_screen.DealRecordScreen(
              recordId: state.pathParameters['id'] ?? '',
            ),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.bidPattern,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'bid_detail_screen',
            load: d_bid_detail_screen.loadLibrary,
            builder: (_) => d_bid_detail_screen.BidDetailScreen(
              bidId: state.pathParameters['id'] ?? '',
              listed: state.extra is CaseBid ? state.extra! as CaseBid : null,
            ),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.caseCommentsPattern,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'case_comments_screen',
            load: d_case_comments_screen.loadLibrary,
            builder: (_) => d_case_comments_screen.CaseCommentsScreen(
              caseId: state.pathParameters['id'] ?? '',
            ),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.placeBidPattern,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'bid_form_screen',
            load: d_bid_form_screen.loadLibrary,
            builder: (_) => d_bid_form_screen.BidFormScreen(
              caseId: state.pathParameters['id'] ?? '',
              initialAmountCents:
                  state.extra is int ? state.extra! as int : null,
            ),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.invites,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'invites_screen',
            load: d_invites_screen.loadLibrary,
            builder: (_) => d_invites_screen.InvitesScreen(),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.workCasePattern,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'work_case_screen',
            load: d_work_case_screen.loadLibrary,
            builder: (_) => d_work_case_screen.WorkCaseScreen(
              caseId: state.pathParameters['id'] ?? '',
            ),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.completedWork,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const CompletedWorkScreen()),
      ),
      GoRoute(
        path: AppRoutes.caseHistory,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'case_history_screens',
            load: d_case_history_screens.loadLibrary,
            builder: (_) => d_case_history_screens.CaseHistoryScreen(),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.templates,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const TemplatesScreen()),
      ),
      GoRoute(
        path: AppRoutes.support,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'support_list_screen',
            load: d_support_list_screen.loadLibrary,
            builder: (_) => d_support_list_screen.SupportListScreen(),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.supportNew,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'support_new_screen',
            load: d_support_new_screen.loadLibrary,
            builder: (_) => d_support_new_screen.SupportNewScreen(),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.supportTicketPattern,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'support_ticket_screen',
            load: d_support_ticket_screen.loadLibrary,
            builder: (_) => d_support_ticket_screen.SupportTicketScreen(
              ticketId: state.pathParameters['id'] ?? '',
            ),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.clientBadge,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'client_badge_screen',
            load: d_client_badge_screen.loadLibrary,
            builder: (_) => d_client_badge_screen.ClientBadgeScreen(),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.referral,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'referral_screen',
            load: d_referral_screen.loadLibrary,
            builder: (_) => d_referral_screen.ReferralScreen(
              initialCode: state.uri.queryParameters['code'],
            ),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.bidPacks,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'bid_packs_screen',
            load: d_bid_packs_screen.loadLibrary,
            builder: (_) => d_bid_packs_screen.BidPacksScreen(),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.stars,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'stars_screen',
            load: d_stars_screen.loadLibrary,
            builder: (_) => d_stars_screen.StarsScreen(),
          ),
        ),
        routes: [
          GoRoute(
            path: 'gifts',
            parentNavigatorKey: _rootNavigatorKey,
            pageBuilder: (context, state) => AppPageTransitions.push(
              state,
              DeferredScreen(
                id: 'my_gifts_screen',
                load: d_my_gifts_screen.loadLibrary,
                builder: (_) => d_my_gifts_screen.MyGiftsScreen(),
              ),
            ),
          ),
        ],
      ),
      GoRoute(
        path: AppRoutes.myFirm,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'firm_screen',
            load: d_firm_screen.loadLibrary,
            builder: (_) => d_firm_screen.FirmScreen(),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.myStats,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'attorney_stats_screen',
            load: d_attorney_stats_screen.loadLibrary,
            builder: (_) => d_attorney_stats_screen.AttorneyStatsScreen(),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.myPromotions,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'my_promotions_screen',
            load: d_my_promotions_screen.loadLibrary,
            builder: (_) => d_my_promotions_screen.MyPromotionsScreen(),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.promotionStatsPattern,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'promotion_stats_screen',
            load: d_promotion_stats_screen.loadLibrary,
            builder: (_) => d_promotion_stats_screen.PromotionStatsScreen(
              id: state.pathParameters['id'] ?? '',
            ),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.partner,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'partner_screen',
            load: d_partner_screen.loadLibrary,
            builder: (_) => d_partner_screen.PartnerScreen(),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.about,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'about_screen',
            load: d_about_screen.loadLibrary,
            builder: (_) => d_about_screen.AboutScreen(),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.saved,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'saved_screen',
            load: d_saved_screen.loadLibrary,
            builder: (_) => d_saved_screen.SavedScreen(),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.payments,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'payments_hub_screen',
            load: d_payments_hub_screen.loadLibrary,
            builder: (_) => d_payments_hub_screen.PaymentsHubScreen(
              initial: d_payments_hub_screen.PaymentsTab.parse(
                state.uri.queryParameters['tab'],
              ),
            ),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.postArchive,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'archive_screen',
            load: d_archive_screen.loadLibrary,
            builder: (_) => d_archive_screen.ArchiveScreen(),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.myQr,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'my_qr_screen',
            load: d_my_qr_screen.loadLibrary,
            builder: (_) => d_my_qr_screen.MyQrScreen(),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.qrScan,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'qr_scanner_screen',
            load: d_qr_scanner_screen.loadLibrary,
            builder: (_) => d_qr_scanner_screen.QrScannerScreen(),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.dataExport,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'data_export_screen',
            load: d_data_export_screen.loadLibrary,
            builder: (_) => d_data_export_screen.DataExportScreen(),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.storage,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'storage_screen',
            load: d_storage_screen.loadLibrary,
            builder: (_) => d_storage_screen.StorageScreen(),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.contacts,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'contacts_screen',
            load: d_contacts_screen.loadLibrary,
            builder: (_) => d_contacts_screen.ContactsScreen(
              initialCalls: state.uri.queryParameters['tab'] == 'calls',
              initialContacts: state.uri.queryParameters['tab'] == 'contacts',
            ),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.blockedUsers,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'blocked_users_screen',
            load: d_blocked_users_screen.loadLibrary,
            builder: (_) => d_blocked_users_screen.BlockedUsersScreen(),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.caseHistoryItemPattern,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'case_history_screens',
            load: d_case_history_screens.loadLibrary,
            builder: (_) => d_case_history_screens.CaseHistoryDetailScreen(
              caseId: state.pathParameters['id'] ?? '',
            ),
          ),
        ),
      ),
      ...authRoutes(),
      ...onboardingRoutes(),
      ...accountRoutes(parentNavigatorKey: _rootNavigatorKey),
      // docs/01_FOUNDATION_AUTH.md §12 content links (/case/:id,
      // /lawyer/:username, /post/:id) — core/deeplinks.
      ...deepLinkRoutes(),
      // docs/05 feed: tag pages, follower lists.
      ...socialRoutes(_rootNavigatorKey),
      // docs/05 chats, notifications, notification settings.
      ...chatRoutes(_rootNavigatorKey),
      // Owner 2026-10-20: group chats, polls, join links.
      ...groupRoutes(_rootNavigatorKey),
      // docs/06 §1.7: Settings → Подписка, payments, gate paywall.
      ...subscriptionRoutes(_rootNavigatorKey),
      // Owner 2026-10-05: payouts, case payments, Stripe return pages.
      ...casePaymentsRoutes(_rootNavigatorKey),
      // Owner 2026-10-20: consultation booking.
      ...consultationsRoutes(_rootNavigatorKey),
      // Owner 2026-10-20: the deadline calculator.
      ...deadlinesRoutes(_rootNavigatorKey),
      // Owner 2026-10-20: «Вопрос юристу».
      ...legalQaRoutes(_rootNavigatorKey),
      // Owner 2026-10-05 (plan builder): Settings → «Подписка клиента».
      ...clientPlanRoutes(_rootNavigatorKey),
      // OQ-048: Team, new task, assistant joining.
      ...teamRoutes(_rootNavigatorKey),
      // Owner 2026-10-05: the attorney's own trust level.
      ...trustRoutes(_rootNavigatorKey),
      // Owner 2026-10-20: stories (24 h) and Telegram-style channels.
      ...storiesRoutes(_rootNavigatorKey),
      ...channelsRoutes(_rootNavigatorKey),
      ...privacyRoutes(_rootNavigatorKey),
    ],
  );
}

final _rootNavigatorKey = GlobalKey<NavigatorState>();

/// The root navigator (pages above the tabs); the system-back guard asks it
/// first (core/navigation/system_back.dart).
GlobalKey<NavigatorState> get appRootNavigatorKey => _rootNavigatorKey;

/// Bridges the guard's inputs (Riverpod) to go_router's
/// `refreshListenable`. Session changes are narrowed to sign-in/sign-out
/// (`sub`), so the 15-minute access-token rotation doesn't re-run the
/// guard for nothing.
class _GuardRefresh extends ChangeNotifier {
  _GuardRefresh(Ref ref) {
    ref
      ..listen(appStartupProvider, (_, __) => notifyListeners())
      ..listen(
        sessionControllerProvider.select((s) => s?.sub),
        (_, __) => notifyListeners(),
      )
      ..listen(currentUserControllerProvider, (_, __) => notifyListeners())
      ..listen(assistantMeProvider, (_, __) => notifyListeners())
      // Owner 2026-10-22: the guest flag arrives with the bootstrap.
      ..listen(guestBrowsingEnabledProvider, (_, __) => notifyListeners());
  }
}

/// OQ-048: the assistant's team state for the guard.
AssistantGate _assistantGate(Ref ref) {
  if (!ref.read(isAssistantProvider)) return AssistantGate.notAssistant;
  final me = ref.read(assistantMeProvider);
  if (me.isLoading && !me.hasValue) return AssistantGate.loading;
  // Offline / error: let them in; the server still refuses what it must.
  if (me.hasError && !me.hasValue) return AssistantGate.active;
  return (me.value?.active ?? false)
      ? AssistantGate.active
      : AssistantGate.notJoined;
}
