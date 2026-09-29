/// Path constants for go_router. Centralized here (never a string literal at
/// a `context.go(...)` call site) so a path rename is a one-line change.
abstract final class AppRoutes {
  static const feed = '/feed';
  static const search = '/search';
  static const mine = '/mine';
  static const profile = '/profile';

  /// Full-screen "+" creation flow (file 07 §3.4: "Экран открывается как
  /// full-screen с крестиком") -- pushed on the ROOT navigator, not a shell
  /// branch, so it covers the bottom nav entirely.
  static const create = '/create';

  /// Pushed on the ROOT navigator (2026-09-22 owner follow-up, file 01
  /// §3.6's "Настройки (гамбургер)"), same reasoning as [create]: a
  /// full-screen settings page should cover the bottom nav, not live
  /// inside the profile tab's own shell branch.
  static const profileSettings = '/profile/settings';

  /// Pushed on the ROOT navigator, same reasoning as [profileSettings]
  /// (Phase 4 of the auth networking work, docs/CHANGELOG.md; file 01
  /// §10.4's "Активные устройства", reachable from Settings ->
  /// Безопасность).
  static const activeDevices = '/profile/settings/devices';

  /// Pushed on the ROOT navigator, same reasoning as [profileSettings]
  /// (Phase 4 of the auth networking work, docs/CHANGELOG.md; file 01
  /// §10.7, reachable from Settings -> Удалить аккаунт).
  static const deleteAccount = '/profile/settings/delete-account';

  /// Initial location (stage 1.7 mobile, docs/01_FOUNDATION_AUTH.md §10.2
  /// A): token check + bootstrap + translations, then AppRouterGuard
  /// routes onward.
  static const splash = '/splash';

  /// "Verify now" target (§11 Шаг 4B) and the Mine/Cases tab gate CTA:
  /// the verification status screen (docs/03 §8 step 6, stage 3.8).
  /// Pushed on the ROOT navigator.
  static const verification = '/verification';

  // --- docs/03 stage 3.9 (practices, profiles, reviews) — all pushed on
  // the ROOT navigator like [profileSettings].

  /// Edit own profile (attorney: docs/03 §4.1; client: §5).
  static const profileEdit = '/profile/edit';

  /// "My practices" (docs/03 §3.2) — attorneys only; locked before
  /// verification.
  static const practices = '/profile/practices';

  /// Settings → "My contacts" (docs/03 §5).
  static const myContacts = '/profile/settings/contacts';

  /// Review form for a closed case (docs/03 §7). File 04 links closed
  /// cases here; `extra` may carry an existing `Review` to edit.
  static const reviewForm = '/profile/review/:caseId';
  static String reviewFormFor(String caseId) =>
      '/profile/review/${Uri.encodeComponent(caseId)}';

  /// "Complete verification" gate for "+" → Post to feed (docs/03 §6.4),
  /// the redirect target of AppRouterGuard for unverified attorneys.
  static const verificationRequired = '/create/verification-required';

  /// Public attorney profile — same path as the `lawbid.app/lawyer/:username`
  /// deep link (docs/01 §12, DeepLinkRoutes.lawyerPath).
  static String lawyer(String username) =>
      '/lawyer/${Uri.encodeComponent(username)}';

  /// The verification wizard (docs/03 §8 steps 1–5), pushed from
  /// [verification].
  static const verificationWizard = '/verification/wizard';

  /// In-app legal document viewer (`/legal/terms`, `/legal/privacy`,
  /// `/legal/disclaimer`), fed by `/config/bootstrap` legal_documents.
  static const legalPrefix = '/legal/';
  static const legal = '/legal/:docType';
  static String legalDoc(String docType) => '$legalPrefix$docType';

  // --- docs/04 cases & bids (stages 4.9/4.10) — ROOT navigator.

  /// The client's own case (docs/04 §11.1).
  static const myCasePattern = '/mine/case/:id';
  static String myCase(String id) => '/mine/case/${Uri.encodeComponent(id)}';

  /// Edit the client's case (docs/04 §3.5).
  static const myCaseEditPattern = '/mine/case/:id/edit';
  static String myCaseEdit(String id) =>
      '/mine/case/${Uri.encodeComponent(id)}/edit';

  /// Bid detail with the negotiation history (docs/04 §5.2, §6).
  static const bidPattern = '/bid/:id';
  static String bid(String id) => '/bid/${Uri.encodeComponent(id)}';

  /// Attorney case detail — the `lawbid.app/case/:id` deep-link path
  /// (DeepLinkRoutes.casePath); the owner is redirected to [myCase].
  static String caseDetail(String id) => '/case/${Uri.encodeComponent(id)}';

  /// Bid form (docs/04 §5.1).
  static const placeBidPattern = '/case/:id/bid';
  static String placeBid(String id) => '/case/${Uri.encodeComponent(id)}/bid';

  /// "В работе" case: contacts, completion (docs/04 §8, §11.2).
  static const workCasePattern = '/mine/work/:id';
  static String workCase(String id) => '/mine/work/${Uri.encodeComponent(id)}';

  /// "Завершённые" (docs/04 §11.2).
  static const completedWork = '/mine/completed';

  /// Settings → "История кейсов" (docs/04 §12).
  static const caseHistory = '/profile/settings/case-history';
  static const caseHistoryItemPattern = '/profile/settings/case-history/:id';
  static String caseHistoryItem(String id) =>
      '/profile/settings/case-history/${Uri.encodeComponent(id)}';

  /// Subscription call-to-action (docs/04 §2; the paywall itself is
  /// docs/06).
  static const subscriptionRequired = '/subscription-required';

  /// The paywall naming the locked action (docs/06 §1.7 п.3):
  /// `bid` | `chat` | `contacts`.
  static String subscriptionRequiredFor(String reason) =>
      '/subscription-required?reason=${Uri.encodeComponent(reason)}';
}
