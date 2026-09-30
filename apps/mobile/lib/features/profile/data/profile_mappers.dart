import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Generated `package:lawbid_api` DTOs → stage-3.9 domain models. Unknown
/// enum values (`$unknown`, a newer server) degrade gracefully.
abstract final class ProfileMappers {
  static StateRef state(api.StateRefDto d) =>
      StateRef(code: d.code, name: d.name);

  static RatingInfo rating(api.RatingDto d) {
    final count = d.count.toInt();
    return RatingInfo(
        average: count == 0 ? null : d.avg.toDouble(), count: count);
  }

  static ProfileCounters counters(api.ProfileCountersDto d) => ProfileCounters(
        posts: d.posts.toInt(),
        followers: d.followers.toInt(),
        following: d.following.toInt(),
      );

  static SelectedPractice selected(api.SelectedPracticeAreaDto d) =>
      SelectedPractice(
        id: d.id,
        i18nKey: d.i18nKey,
        nameEn: d.nameEn,
        categoryId: d.categoryId,
        categoryI18nKey: d.categoryI18nKey,
        categoryCode: d.categoryCode,
      );

  static PracticeCategory category(api.PracticeAreaCategoryDto d) =>
      PracticeCategory(
        id: d.id,
        i18nKey: d.i18nKey,
        nameEn: d.nameEn,
        children: [
          for (final c in d.children)
            PracticeLeaf(id: c.id, i18nKey: c.i18nKey, nameEn: c.nameEn),
        ],
      );

  static PublicAttorneyProfile publicProfile(api.PublicAttorneyProfileDto d) =>
      PublicAttorneyProfile(
        id: d.id,
        username: d.username,
        firstName: d.firstName,
        lastName: d.lastName,
        bio: d.bio,
        firmName: d.firmName,
        firms: d.firms,
        languages: d.languages,
        verifiedBadge: d.verifiedBadge,
        licensedStates: d.licensedStates.map(state).toList(growable: false),
        practices: d.practiceAreas.map(selected).toList(growable: false),
        rating: rating(d.rating),
        counters: counters(d.counters),
        isSelf: d.isSelf,
        isFollowing: d.isFollowing,
        isBlocked: d.isBlocked,
        hasBlockedMe: d.hasBlockedMe,
        // The header avatar is small: prefer the 256 px square variant.
        avatarUrl: d.avatarUrl256 ?? d.avatarUrl,
      );

  static LicenseState license(api.LicenseStatus s) => switch (s) {
        api.LicenseStatus.pending => LicenseState.pending,
        api.LicenseStatus.verified => LicenseState.verified,
        api.LicenseStatus.rejected => LicenseState.rejected,
        api.LicenseStatus.expired => LicenseState.expired,
        api.LicenseStatus.suspended => LicenseState.suspended,
        _ => LicenseState.unknown,
      };

  static OwnAttorneyProfile ownProfile(api.OwnAttorneyProfileDto d) =>
      OwnAttorneyProfile(
        id: d.id,
        username: d.username,
        firstName: d.firstName,
        lastName: d.lastName,
        bio: d.bio,
        firmName: d.firmName,
        firms: d.firms,
        languages: d.languages,
        verification: AttorneyVerification.parse(d.verificationStatus.json),
        verifiedBadge: d.verifiedBadge,
        nameMismatch: d.nameMismatch,
        usernameNextChangeAt: d.usernameNextChangeAt,
        licenses: [
          for (final l in d.licenses)
            AttorneyLicense(
              id: l.id,
              state: state(l.state),
              status: license(l.status),
              expiresAt: l.expiresAt,
            ),
        ],
      );

  static UsernameCheck username(api.UsernameAvailabilityDto d) => UsernameCheck(
        username: d.username,
        available: d.available,
        issue: switch (d.reason) {
          api.UsernameUnavailableReason.invalid => UsernameIssue.invalid,
          api.UsernameUnavailableReason.reserved => UsernameIssue.reserved,
          api.UsernameUnavailableReason.taken => UsernameIssue.taken,
          _ => d.available ? null : UsernameIssue.invalid,
        },
      );

  static ReviewSummary summary(api.ReviewSummaryDto d) => ReviewSummary(
        average: d.ratingAvg?.toDouble(),
        count: d.ratingCount,
        distribution: {
          for (var s = 5; s >= 1; s--) s: 0,
          for (final b in d.distribution) b.stars: b.count,
        },
      );

  static Review publicReview(api.PublicReviewDto d) => Review(
        id: d.id,
        rating: d.rating,
        body: d.body,
        authorDisplayName: d.authorDisplayName,
        createdAt: d.createdAt,
        editedAt: d.editedAt,
      );

  static Review ownReview(api.ReviewDto d) => Review(
        id: d.id,
        rating: d.rating,
        body: d.body,
        authorDisplayName: d.authorDisplayName,
        createdAt: d.createdAt,
        editedAt: d.editedAt,
        editableUntil: d.editableUntil,
        editable: d.editable,
      );

  static PublicClientProfile publicClient(api.PublicClientProfileDto d) =>
      PublicClientProfile(
        id: d.id,
        username: d.username,
        firstName: d.firstName,
        lastName: d.lastName,
        avatarUrl: d.avatarUrl,
        state: state(d.state),
        memberSince: DateTime.tryParse(d.memberSince) ?? DateTime.now(),
        isSelf: d.isSelf,
        isBlocked: d.isBlocked,
        hasBlockedMe: d.hasBlockedMe,
        verified: d.verifiedBadge,
        postsCount: d.postsCount.toInt(),
        followersCount: d.followersCount.toInt(),
        followingCount: d.followingCount.toInt(),
        isFollowing: d.isFollowing,
        canSeeReviews: d.canSeeReviews,
        ratingAvg: d.ratingAvg?.toDouble(),
        ratingCount: d.ratingCount.toInt(),
      );

  static ClientReview clientReview(api.ClientReviewDto d) => ClientReview(
        id: d.id,
        caseId: d.caseId,
        caseTitle: d.caseTitle,
        rating: d.rating.toInt(),
        body: d.body,
        attorneyId: d.attorney.id,
        attorneyUsername: d.attorney.username,
        attorneyName: d.attorney.displayName,
        attorneyAvatarUrl: d.attorney.avatarUrl,
        attorneyVerified: d.attorney.verifiedBadge,
        isMine: d.isMine,
        createdAt: DateTime.parse(d.createdAt).toLocal(),
      );

  static ClientProfileDetails client(api.ClientProfileDto d) =>
      ClientProfileDetails(
        id: d.id,
        username: d.username,
        usernameNextChangeAt: d.usernameNextChangeAt == null
            ? null
            : DateTime.tryParse(d.usernameNextChangeAt!),
        firstName: d.firstName,
        lastName: d.lastName,
        state: state(d.state),
        languages: d.languages,
        contactMethod: ContactPreference.fromWire(d.contactMethod?.json),
        contactNote: d.contactNote,
      );
}
