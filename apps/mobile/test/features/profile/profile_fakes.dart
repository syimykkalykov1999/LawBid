import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/data/avatar_upload_repository.dart';
import 'package:lawbid/features/profile/data/profile_repositories.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/shared/domain/user_role.dart';

import '../../helpers/onboarding_harness.dart';
import '../cases/cases_fakes.dart';

/// Fixed "now" for window rules (review edit, username cooldown).
final kNow = DateTime.utc(2026, 9, 20, 12);

CurrentUser attorneyMe({String status = 'verified', String username = 'jane.doe', String? avatarUrl}) =>
    CurrentUser(
      id: 'att-1',
      role: UserRole.attorney,
      status: 'active',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      emailVerified: true,
      phone: '+15551234567',
      phoneVerified: true,
      uiLanguage: 'en',
      theme: null,
      requiredConsentsGranted: true,
      onboarding: OnboardingProgress(
        currentStep: OnboardingStepId.tour,
        completedAt: DateTime.utc(2026, 9, 1),
      ),
      missing: const {},
      avatarUrl: avatarUrl,
      attorneyProfile: AttorneyProfile(username: username, verificationStatus: status, licensedStates: const ['NY']),
    );

CurrentUser clientMe() => CurrentUser(
      id: 'cl-1',
      role: UserRole.client,
      status: 'active',
      firstName: 'Anna',
      lastName: 'Kowalski',
      email: 'anna@example.com',
      emailVerified: true,
      phone: '+15557654321',
      phoneVerified: true,
      uiLanguage: 'en',
      theme: null,
      requiredConsentsGranted: true,
      onboarding: OnboardingProgress(
        currentStep: OnboardingStepId.tour,
        completedAt: DateTime.utc(2026, 9, 1),
      ),
      missing: const {},
      clientProfile: const ClientProfile(stateCode: 'CA', languages: ['en']),
    );

const _family = 'cat-family';

PublicAttorneyProfile attorneyProfile({
  bool isSelf = false,
  bool withReviews = true,
  bool verified = true,
  String username = 'jane.doe',
  String? avatarUrl,
}) =>
    PublicAttorneyProfile(
      id: 'att-1',
      username: username,
      firstName: 'Jane',
      lastName: 'Doe',
      bio: 'Family and immigration attorney. 12 years helping families in New York.',
      firmName: 'Doe & Partners LLP',
      languages: const ['en', 'es'],
      verifiedBadge: verified,
      licensedStates: const [StateRef(code: 'NY', name: 'New York'), StateRef(code: 'NJ', name: 'New Jersey')],
      practices: const [
        SelectedPractice(id: 'l-div', i18nKey: 'practice.family.divorce', nameEn: 'Divorce', categoryId: _family, categoryI18nKey: 'practice.family', categoryCode: 'family_law'),
        SelectedPractice(id: 'l-cus', i18nKey: 'practice.family.custody', nameEn: 'Child Custody', categoryId: _family, categoryI18nKey: 'practice.family', categoryCode: 'family_law'),
        SelectedPractice(id: 'l-vis', i18nKey: 'practice.imm.visas', nameEn: 'Work Visas', categoryId: 'cat-imm', categoryI18nKey: 'practice.imm', categoryCode: 'immigration'),
      ],
      rating: withReviews ? const RatingInfo(average: 4.5, count: 12) : const RatingInfo(average: null, count: 0),
      counters: const ProfileCounters(posts: 24, followers: 1280, following: 36),
      isSelf: isSelf,
      avatarUrl: avatarUrl,
    );

const practiceTree = [
  PracticeCategory(
    id: _family,
    i18nKey: 'practice.family',
    nameEn: 'Family Law',
    children: [
      PracticeLeaf(id: 'l-div', i18nKey: 'practice.family.divorce', nameEn: 'Divorce'),
      PracticeLeaf(id: 'l-cus', i18nKey: 'practice.family.custody', nameEn: 'Child Custody'),
      PracticeLeaf(id: 'l-adp', i18nKey: 'practice.family.adoption', nameEn: 'Adoption'),
    ],
  ),
  PracticeCategory(
    id: 'cat-imm',
    i18nKey: 'practice.imm',
    nameEn: 'Immigration',
    children: [
      PracticeLeaf(id: 'l-vis', i18nKey: 'practice.imm.visas', nameEn: 'Work Visas'),
      PracticeLeaf(id: 'l-asy', i18nKey: 'practice.imm.asylum', nameEn: 'Asylum'),
    ],
  ),
];

Review review(int i, {int rating = 5, String? body, bool edited = false}) => Review(
      id: 'r$i',
      rating: rating,
      body: body ?? 'Clear, calm and always one step ahead. Highly recommend.',
      authorDisplayName: 'Anna K.',
      createdAt: DateTime.utc(2026, 9, 10 - (i % 9), 12),
      editedAt: edited ? DateTime.utc(2026, 9, 12, 12) : null,
    );

const summaryWithReviews = ReviewSummary(average: 4.5, count: 12, distribution: {5: 8, 4: 3, 3: 1, 2: 0, 1: 0});

class FakeAttorneyRepo implements AttorneyProfileRepository {
  FakeAttorneyRepo({this.profile, this.error, this.own});

  PublicAttorneyProfile? profile;
  Object? error;
  OwnAttorneyProfile? own;
  final checked = <String>[];
  final patches = <AttorneyProfilePatch>[];
  Map<String, UsernameCheck> availability = {};

  @override
  Future<PublicAttorneyProfile> fetchPublic(String username) async {
    if (error != null) throw error!;
    return profile!;
  }

  @override
  Future<OwnAttorneyProfile> fetchOwn() async => own!;

  @override
  Future<OwnAttorneyProfile> updateOwn(AttorneyProfilePatch patch) async {
    patches.add(patch);
    return own!;
  }

  @override
  Future<UsernameCheck> checkUsername(String username) async {
    checked.add(username);
    return availability[username] ?? UsernameCheck(username: username, available: true);
  }
}

class FakePracticesRepo implements PracticesRepository {
  FakePracticesRepo({this.selected = const [], this.replaceError});

  List<SelectedPractice> selected;
  Object? replaceError;
  final replaced = <List<String>>[];

  @override
  Future<List<PracticeCategory>> fetchTree() async => practiceTree;

  @override
  Future<List<SelectedPractice>> fetchSelected() async => selected;

  @override
  Future<List<SelectedPractice>> replace(List<String> leafIds) async {
    if (replaceError != null) throw replaceError!;
    replaced.add(leafIds);
    final leaves = {for (final c in practiceTree) for (final l in c.children) l.id: (c, l)};
    return [
      for (final id in leafIds)
        SelectedPractice(
          id: id,
          i18nKey: leaves[id]!.$2.i18nKey,
          nameEn: leaves[id]!.$2.nameEn,
          categoryId: leaves[id]!.$1.id,
          categoryI18nKey: leaves[id]!.$1.i18nKey,
        ),
    ];
  }
}

class FakeReviewsRepo implements ReviewsRepository {
  FakeReviewsRepo({this.pages = const [], this.summaryValue = const ReviewSummary.empty()});

  /// Pages served in order; the cursor is the page index.
  List<List<Review>> pages;
  ReviewSummary summaryValue;
  final listCursors = <String?>[];
  final created = <(String, int, String?)>[];
  final updated = <(String, int, String?)>[];
  final reported = <(String, ReviewReportReason)>[];
  Object? createError;

  /// `GET /cases/:caseId/review` answer (null = none yet) / failure.
  Review? own;
  Object? ownError;
  final ownRequests = <String>[];

  @override
  Future<Review?> ownForCase(String caseId) async {
    ownRequests.add(caseId);
    if (ownError != null) throw ownError!;
    return own;
  }

  /// Star filters and orders asked for (owner's review filter).
  final listFilters = <(int?, bool)>[];
  final sorts = <ReviewsSort>[];

  @override
  Future<ReviewPage> list(String attorneyId,
      {String? cursor,
      int? rating,
      ReviewsSort sort = ReviewsSort.newest}) async {
    listCursors.add(cursor);
    sorts.add(sort);
    listFilters.add((rating, sort == ReviewsSort.oldest));
    final index = cursor == null ? 0 : int.parse(cursor);
    if (pages.isEmpty) return const ReviewPage(items: []);
    final items = pages[index].where((r) => rating == null || r.rating == rating).toList();
    return ReviewPage(items: items, nextCursor: index + 1 < pages.length ? '${index + 1}' : null);
  }

  @override
  Future<ReviewSummary> summary(String attorneyId) async => summaryValue;

  @override
  Future<Review> create(String caseId, {required int rating, String? body}) async {
    if (createError != null) throw createError!;
    created.add((caseId, rating, body));
    return Review(
      id: 'new',
      rating: rating,
      body: body,
      authorDisplayName: 'Anna K.',
      createdAt: kNow,
      editableUntil: kNow.add(const Duration(days: 14)),
    );
  }

  @override
  Future<Review> update(String reviewId, {required int rating, String? body}) async {
    updated.add((reviewId, rating, body));
    return Review(
      id: reviewId,
      rating: rating,
      body: body,
      authorDisplayName: 'Anna K.',
      createdAt: kNow,
      editedAt: kNow,
      editableUntil: kNow.add(const Duration(days: 14)),
    );
  }

  @override
  Future<void> report(String reviewId, ReviewReportReason reason,
          {String? note}) async =>
      reported.add((reviewId, reason));

  // Owner 2026-10-01 (Google-style).
  Review? mineValue;
  final calls = <String>[];

  @override
  Future<Review?> mine(String attorneyId) async => mineValue;

  @override
  Future<Review> saveMine(String attorneyId,
      {required int rating, String? body, List<String>? photoIds}) async {
    calls.add('save:$attorneyId:$rating');
    return mineValue = Review(
      id: 'mine',
      rating: rating,
      body: body,
      createdAt: kNow,
      isMine: true,
      fromCase: false,
    );
  }

  @override
  Future<void> delete(String reviewId) async => calls.add('delete:$reviewId');

  @override
  Future<Review> reply(String reviewId, String? body) async {
    calls.add('reply:$reviewId:$body');
    return Review(id: reviewId, rating: 5, createdAt: kNow, reply: body);
  }

  @override
  Future<Review> helpful(String reviewId, {required bool on}) async {
    calls.add('helpful:$reviewId:$on');
    return Review(
        id: reviewId, rating: 5, createdAt: kNow, helpfulByMe: on);
  }
}

class FakeClientRepo implements ClientProfileRepository {
  FakeClientRepo({this.error});

  Object? error;
  final prefs = <(ContactPreference?, String)>[];
  ClientProfileDetails profile = const ClientProfileDetails(
    id: 'cl-1',
    username: 'anna.kowalski',
    firstName: 'Anna',
    lastName: 'Kowalski',
    state: StateRef(code: 'CA', name: 'California'),
    languages: ['en'],
    contactMethod: ContactPreference.sms,
  );

  @override
  Future<ClientProfileDetails> fetch() async {
    if (error != null) throw error!;
    return profile;
  }

  @override
  Future<ClientProfileDetails> update(ClientProfilePatch patch) async => profile;

  @override
  Future<PublicClientProfile> fetchPublic(String username) async {
    if (error != null) throw error!;
    // OQ-038: the own profile screen loads the same public profile.
    if (username == profile.username) {
      return PublicClientProfile(
        id: 'cl-1',
        username: username,
        firstName: profile.firstName,
        lastName: profile.lastName,
        state: profile.state,
        memberSince: kNow,
        isSelf: true,
        canSeeReviews: true,
        followingCount: 3,
      );
    }
    return PublicClientProfile(
      id: 'cl-2',
      username: username,
      firstName: 'Mini',
      lastName: 'Client',
      state: const StateRef(code: 'NY', name: 'New York'),
      memberSince: kNow,
      isSelf: false,
    );
  }

  @override
  Future<ClientProfileDetails> updateContactPreferences({required ContactPreference? method, required String note}) async {
    prefs.add((method, note));
    return profile;
  }
}

/// Scripted upload pipeline.
class FakeAvatarRepo implements AvatarUploadRepository {
  FakeAvatarRepo({required this.me});

  CurrentUser me;
  int uploadFailures = 0;
  final steps = <String>[];

  /// When true, the storage upload hangs until it is cancelled (then
  /// throws like the real Dio-backed one).
  bool holdUpload = false;
  UploadCancellation? lastCancellation;

  @override
  Future<PresignedUpload> presign({required String mime, required int sizeBytes, required String sha256}) async {
    steps.add('presign:$mime:$sizeBytes');
    return const PresignedUpload(fileId: 'f1', url: 'https://storage.test/bucket', fields: {'key': 'k'});
  }

  @override
  Future<void> upload(
    PresignedUpload target,
    Uint8List bytes,
    String mime, {
    void Function(double progress)? onProgress,
    UploadCancellation? cancellation,
  }) async {
    steps.add('upload');
    lastCancellation = cancellation;
    onProgress?.call(0.5);
    if (holdUpload) {
      final cancelled = Completer<void>();
      cancellation?.onCancel(cancelled.complete);
      await cancelled.future;
      throw const UploadCancelledException();
    }
    if (uploadFailures > 0) {
      uploadFailures--;
      throw const ApiException(code: ApiException.networkErrorCode, message: 'offline');
    }
    onProgress?.call(1);
  }

  @override
  Future<ScanOutcome> confirm(String fileId) async {
    steps.add('confirm');
    return ScanOutcome.clean;
  }

  @override
  Future<ScanOutcome> scanStatus(String fileId) async => ScanOutcome.clean;

  @override
  Future<CurrentUser> attach(String fileId) async {
    steps.add('attach:$fileId');
    return me;
  }
}

const notFound = ApiException(code: ApiErrorCodes.notFound, message: 'Not found', statusCode: 404);
const offline = ApiException(code: ApiException.networkErrorCode, message: 'offline');

/// Overrides for profile tests.
List<Override> profileOverrides({
  FakeAttorneyRepo? attorneys,
  FakePracticesRepo? practices,
  FakeReviewsRepo? reviews,
  FakeClientRepo? clients,
  FakeAvatarRepo? avatars,
}) =>
    [
      attorneyProfileRepositoryProvider.overrideWithValue(attorneys ?? FakeAttorneyRepo(profile: attorneyProfile())),
      practicesRepositoryProvider.overrideWithValue(practices ?? FakePracticesRepo()),
      reviewsRepositoryProvider.overrideWithValue(reviews ?? FakeReviewsRepo()),
      clientProfileRepositoryProvider.overrideWithValue(clients ?? FakeClientRepo()),
      if (avatars != null) avatarUploadRepositoryProvider.overrideWithValue(avatars),
      clockProvider.overrideWithValue(() => kNow),
      ...casesOverrides(),
    ];

/// [onboardingWrapper] with the profile fakes.
Future<Widget Function(Widget)> profileWrapper(
  ThemeData theme, {
  CurrentUser? user,
  List<Override> overrides = const [],
  double textScale = 1,
}) =>
    onboardingWrapper(theme, user: user, extra: overrides, textScale: textScale);
