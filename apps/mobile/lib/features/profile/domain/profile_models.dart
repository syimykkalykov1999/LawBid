import 'package:flutter/foundation.dart';

/// Domain models for docs/03 §3–§7 (practices, attorney/client profiles,
/// reviews) — stage 3.9. Mapped from the generated `package:lawbid_api`
/// DTOs in data/profile_mappers.dart so screens and tests never depend on
/// wire shapes.

/// Attorney verification status (docs/03 §2.3, §6.1).
enum AttorneyVerification {
  unverified,
  pending,
  verified,
  rejected,
  suspended;

  static AttorneyVerification parse(String? raw) =>
      AttorneyVerification.values.asNameMap()[raw] ?? unverified;

  /// docs/03 §1/§6.1: only `verified` unlocks practices, the Cases tab and
  /// posting to the feed.
  bool get isVerified => this == verified;
}

enum LicenseState { pending, verified, rejected, expired, suspended, unknown }

@immutable
class StateRef {
  const StateRef({required this.code, required this.name});
  final String code;
  final String name;
}

@immutable
class AttorneyLicense {
  const AttorneyLicense({
    required this.id,
    required this.state,
    required this.status,
    this.expiresAt,
  });
  final String id;
  final StateRef state;
  final LicenseState status;
  final DateTime? expiresAt;
}

@immutable
class ProfileCounters {
  const ProfileCounters({
    this.posts = 0,
    this.followers = 0,
    this.following = 0,
  });
  final int posts;
  final int followers;
  final int following;
}

/// `rating_avg` / `rating_count` (docs/03 §7.5). [average] is null when
/// there are no reviews ("Новый — без отзывов", §4.2).
@immutable
class RatingInfo {
  const RatingInfo({required this.average, required this.count});
  final double? average;
  final int count;
  bool get isNew => count == 0 || average == null;
}

/// A leaf practice area picked by an attorney (docs/03 §3.2).
@immutable
class SelectedPractice {
  const SelectedPractice({
    required this.id,
    required this.i18nKey,
    required this.nameEn,
    required this.categoryId,
    required this.categoryI18nKey,
    this.categoryCode = '',
  });
  final String id;
  final String i18nKey;
  final String nameEn;
  final String categoryId;
  final String categoryI18nKey;
  final String categoryCode;
}

@immutable
class PracticeLeaf {
  const PracticeLeaf({
    required this.id,
    required this.i18nKey,
    required this.nameEn,
  });
  final String id;
  final String i18nKey;
  final String nameEn;
}

@immutable
class PracticeCategory {
  const PracticeCategory({
    required this.id,
    required this.i18nKey,
    required this.nameEn,
    required this.children,
  });
  final String id;
  final String i18nKey;
  final String nameEn;
  final List<PracticeLeaf> children;
}

/// `GET /attorneys/:username` (docs/03 §4.2, §4.3). Bar numbers never
/// appear here (§6.2); [licensedStates] are verified licenses only.
@immutable
class PublicAttorneyProfile {
  const PublicAttorneyProfile({
    required this.id,
    required this.username,
    required this.verifiedBadge,
    required this.rating,
    required this.isSelf,
    this.firstName,
    this.lastName,
    this.bio,
    this.firmName,
    this.languages = const [],
    this.licensedStates = const [],
    this.practices = const [],
    this.counters = const ProfileCounters(),
    this.avatarUrl,
    this.isFollowing = false,
  });

  final String id;
  final String username;
  final String? firstName;
  final String? lastName;
  final String? bio;
  final String? firmName;
  final List<String> languages;

  /// Blue check (docs/03 §6.3), decided by the server.
  final bool verifiedBadge;
  final List<StateRef> licensedStates;
  final List<SelectedPractice> practices;
  final RatingInfo rating;
  final ProfileCounters counters;
  final bool isSelf;

  /// The viewer follows this attorney (docs/05 §6).
  final bool isFollowing;

  /// Signed link to the attorney photo (`avatarUrl256`, else the 1024 px
  /// `avatarUrl` of `GET /attorneys/:username`); null → initials.
  final String? avatarUrl;

  String get fullName =>
      [firstName, lastName].whereType<String>().where((s) => s.isNotEmpty).join(' ');
}

/// `GET /attorneys/me/profile` — the editor's source (docs/03 §4.1).
@immutable
class OwnAttorneyProfile {
  const OwnAttorneyProfile({
    required this.id,
    required this.username,
    required this.verification,
    required this.verifiedBadge,
    this.firstName,
    this.lastName,
    this.bio,
    this.firmName,
    this.languages = const [],
    this.usernameNextChangeAt,
    this.licenses = const [],
  });

  final String id;
  final String username;
  final String? firstName;
  final String? lastName;
  final String? bio;
  final String? firmName;
  final List<String> languages;
  final AttorneyVerification verification;
  final bool verifiedBadge;

  /// When @username may change again; null = now (30-day cooldown, §4.1).
  final DateTime? usernameNextChangeAt;
  final List<AttorneyLicense> licenses;

  bool usernameLocked(DateTime now) =>
      usernameNextChangeAt != null && usernameNextChangeAt!.isAfter(now);
}

/// Partial update for `PATCH /attorneys/me/profile`; null = unchanged.
@immutable
class AttorneyProfilePatch {
  const AttorneyProfilePatch({
    this.firstName,
    this.lastName,
    this.bio,
    this.firmName,
    this.languages,
    this.username,
  });
  final String? firstName;
  final String? lastName;
  final String? bio;
  final String? firmName;
  final List<String>? languages;
  final String? username;

  bool get isEmpty =>
      firstName == null &&
      lastName == null &&
      bio == null &&
      firmName == null &&
      languages == null &&
      username == null;
}

enum UsernameIssue { invalid, reserved, taken }

@immutable
class UsernameCheck {
  const UsernameCheck({required this.username, required this.available, this.issue});
  final String username;
  final bool available;
  final UsernameIssue? issue;
}

/// Review summary (docs/03 §7.4): average, count, distribution 5 → 1.
@immutable
class ReviewSummary {
  const ReviewSummary({
    required this.average,
    required this.count,
    required this.distribution,
  });

  const ReviewSummary.empty()
      : average = null,
        count = 0,
        distribution = const {5: 0, 4: 0, 3: 0, 2: 0, 1: 0};

  final double? average;
  final int count;

  /// stars → number of reviews.
  final Map<int, int> distribution;

  bool get isNew => count == 0;
}

/// A published review (docs/03 §7.4). [authorDisplayName] is "Anna K."
/// (the server formats it); no avatar — client privacy.
@immutable
class Review {
  const Review({
    required this.id,
    required this.rating,
    required this.createdAt,
    this.body,
    this.authorDisplayName,
    this.editedAt,
    this.editableUntil,
    this.editable,
  });

  final String id;
  final int rating;
  final String? body;
  final String? authorDisplayName;
  final DateTime createdAt;
  final DateTime? editedAt;

  /// Only on the author's own review (`ReviewDto`): created + 14 days.
  final DateTime? editableUntil;

  /// The server's verdict on the author's own review (`ReviewDto.editable`):
  /// false once moderated or past the window; null = not reported.
  final bool? editable;

  bool get isEdited => editedAt != null;

  bool canEdit(DateTime now) =>
      editable != false && editableUntil != null && now.isBefore(editableUntil!);
}

/// A page of a cursor-paginated list (`meta.nextCursor`).
@immutable
class ReviewPage {
  const ReviewPage({required this.items, this.nextCursor});
  final List<Review> items;
  final String? nextCursor;
}

enum ReviewReportReason { spam, abuse, misinformation, impersonation, inappropriate, other }

/// Preferred contact method (docs/01 §11 3A); wire `in_app_chat` = chat.
enum ContactPreference {
  call,
  sms,
  email,
  chat;

  String get wire => this == chat ? 'in_app_chat' : name;

  static ContactPreference? fromWire(String? raw) => switch (raw) {
        'call' => call,
        'sms' => sms,
        'email' => email,
        'in_app_chat' => chat,
        _ => null,
      };
}

/// `GET /users/me/profile` — the client's private profile (docs/03 §5).
@immutable
class ClientProfileDetails {
  const ClientProfileDetails({
    required this.id,
    required this.state,
    this.firstName,
    this.lastName,
    this.languages = const [],
    this.contactMethod,
    this.contactNote,
  });
  final String id;
  final String? firstName;
  final String? lastName;
  final StateRef state;
  final List<String> languages;
  final ContactPreference? contactMethod;
  final String? contactNote;

  String get fullName =>
      [firstName, lastName].whereType<String>().where((s) => s.isNotEmpty).join(' ');
}

/// Partial update for `PATCH /users/me/profile`; null = unchanged.
@immutable
class ClientProfilePatch {
  const ClientProfilePatch({
    this.firstName,
    this.lastName,
    this.stateCode,
    this.languages,
    this.contactMethod,
    this.contactNote,
  });
  final String? firstName;
  final String? lastName;
  final String? stateCode;
  final List<String>? languages;
  final ContactPreference? contactMethod;
  final String? contactNote;
}

/// Initials for an avatar placeholder ("Anna Kowalski" → "AK").
String initialsOf(String? first, String? last, {String fallback = ''}) {
  final parts = [first, last]
      .whereType<String>()
      .map((s) => s.trim())
      .where((s) => s.isNotEmpty)
      .map((s) => s.substring(0, 1).toUpperCase())
      .join();
  return parts.isEmpty ? fallback.substring(0, fallback.isEmpty ? 0 : 1).toUpperCase() : parts;
}
