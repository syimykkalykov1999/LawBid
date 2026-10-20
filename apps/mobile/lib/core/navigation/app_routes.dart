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

  /// Public attorney profile — same path as the `lawbid.dev/lawyer/:username`
  /// deep link (docs/01 §12, DeepLinkRoutes.lawyerPath).
  static String lawyer(String username) =>
      '/lawyer/${Uri.encodeComponent(username)}';

  /// `lawbid.dev/u/<username>` — the address inside a profile QR code: an
  /// attorney's or a client's profile, whichever the username belongs to.
  static const profileByUsernamePattern = '/u/:username';
  static String profileByUsername(String username) =>
      '/u/${Uri.encodeComponent(username)}';

  /// `lawbid.dev/q/<id>` — the sign-in QR of the website. On the phone:
  /// "Sign in on the web?"; in the browser: the "open the app" page. Public
  /// (no session needed to see it).
  static const webLoginPrefix = '/q/';
  static const webLoginPattern = '/q/:id';
  static String webLogin(String qrId) => '/q/${Uri.encodeComponent(qrId)}';

  /// Profile → "My QR code" (owner 2026-10-20), and the scanner.
  static const myQr = '/qr/my';
  static const qrScan = '/qr/scan';

  /// Public client mini-profile (OQ-026), opened from People search,
  /// followers and @mentions.
  static String client(String username) =>
      '/client/${Uri.encodeComponent(username)}';

  /// The verification wizard (docs/03 §8 steps 1–5), pushed from
  /// [verification].
  static const verificationWizard = '/verification/wizard';

  /// In-app legal document viewer (`/legal/terms`, `/legal/privacy`,
  /// `/legal/disclaimer`), fed by `/config/bootstrap` legal_documents.
  static const legalPrefix = '/legal/';
  static const legal = '/legal/:docType';
  static String legalDoc(String docType) => '$legalPrefix$docType';

  /// Owner 2026-10-05 (legal documents): the screen where the user accepts
  /// the new or changed documents of their role (one unchecked box per
  /// document). Deliberately NOT under [legalPrefix]: the guard sends users
  /// here, while `/legal/*` stays open for reading.
  static const legalAccept = '/legal-accept';

  /// Owner 2026-10-05 (legal): the DMCA takedown form. `targetType` /
  /// `targetId` name the content on LawBid (from the report sheet); without
  /// them the form asks for a URL. Registered BEFORE [legal] so the static
  /// path wins over `:docType`.
  static const dmcaNotice = '/legal/dmca';
  static String dmcaNoticeFor({String? targetType, String? targetId}) {
    if (targetType == null || targetId == null || targetId.isEmpty) {
      return dmcaNotice;
    }
    return Uri(
      path: dmcaNotice,
      queryParameters: {'targetType': targetType, 'targetId': targetId},
    ).toString();
  }

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

  /// Attorney case detail — the `lawbid.dev/case/:id` deep-link path
  /// (DeepLinkRoutes.casePath); the owner is redirected to [myCase].
  static String caseDetail(String id) => '/case/${Uri.encodeComponent(id)}';

  /// Bid form (docs/04 §5.1).
  static const placeBidPattern = '/case/:id/bid';

  /// OQ-034: comments under a case (owner and attorneys who see it).
  static const caseCommentsPattern = '/case/:id/comments';
  static String caseComments(String id) =>
      '/case/${Uri.encodeComponent(id)}/comments';
  static String placeBid(String id) => '/case/${Uri.encodeComponent(id)}/bid';

  /// "В работе" case: contacts, completion (docs/04 §8, §11.2).
  /// Owner 2026-10-05: cases clients offered to the attorney.
  static const invites = '/mine/invites';

  static const workCasePattern = '/mine/work/:id';
  static String workCase(String id) => '/mine/work/${Uri.encodeComponent(id)}';

  /// "Завершённые" (docs/04 §11.2).
  static const completedWork = '/mine/completed';

  /// Settings → "История кейсов" (docs/04 §12).
  static const caseHistory = '/profile/settings/case-history';

  /// Settings → «Скачать мои данные» (docs/06 §5.2).
  /// Settings → Blocked users (OQ-028).
  static const blockedUsers = '/profile/settings/blocked';

  /// Owner 2026-10-20: phone-book contacts on LawBid + invites, pushed on
  /// the ROOT navigator like [blockedUsers].
  static const contacts = '/profile/settings/phone-contacts';

  static const dataExport = '/profile/settings/data-export';
  // Owner 2026-10-02: About LawBid + the website link.
  static const about = '/profile/settings/about';
  // Owner 2026-10-15: the client's saved posts, moved here from «Mine».
  static const saved = '/profile/settings/saved';
  // Owner 2026-10-18 (Instagram): my archived posts.
  static const postArchive = '/profile/settings/archive';
  // Owner 2026-10-18: «Справочник» — the «i» in the case lists.
  static const guide = '/guide';
  static const referral = '/profile/settings/referral';
  // Owner 2026-10-05: my promoted posts / cases (reach, clicks, stop).
  static const myPromotions = '/profile/settings/promotions';
  static const promotionStatsPattern = '/profile/settings/promotions/:id';
  static String promotionStats(String id) =>
      '/profile/settings/promotions/${Uri.encodeComponent(id)}';
  static const myStats = '/profile/settings/stats';
  static const bidPacks = '/profile/settings/bid-packs';
  static const stars = '/profile/settings/stars';
  static const myGifts = '/profile/settings/stars/gifts';
  static const myFirm = '/profile/settings/firm';
  // Owner 2026-10-05: partner program (shown to partners only).
  static const partner = '/profile/settings/partner';

  /// Owner 2026-10-02: the client's paid gold badge (verify my account).
  static const clientBadge = '/profile/settings/verify-account';
  // Owner 2026-10-05: the document templates library.
  static const templates = '/profile/settings/templates';

  // Owner 2026-10-02: Help & support (tickets to the LawBid team).
  static const support = '/profile/settings/support';
  static const supportNew = '/profile/settings/support/new';
  static const supportTicketPattern = '/profile/settings/support/:id';
  static String supportTicket(String id) =>
      '/profile/settings/support/${Uri.encodeComponent(id)}';
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
