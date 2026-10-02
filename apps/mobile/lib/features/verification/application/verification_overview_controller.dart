import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/features/verification/domain/verification_models.dart';
import 'package:lawbid/features/verification/verification_providers.dart';

/// `GET /verification/me` behind the status screen (docs/03 §8.6).
final verificationOverviewProvider = AsyncNotifierProvider.autoDispose<
    VerificationOverviewController, VerificationOverview>(
  VerificationOverviewController.new,
  // No silent retries: a failure shows the error/offline state with its
  // Retry button (docs/01 §8.3).
  retry: (retryCount, error) => null,
);

class VerificationOverviewController
    extends AsyncNotifier<VerificationOverview> {
  @override
  Future<VerificationOverview> build() =>
      ref.watch(verificationRepositoryProvider).overview();

  /// Reloads; with data on screen a failure keeps it and rethrows.
  Future<void> refresh() async {
    final repo = ref.read(verificationRepositoryProvider);
    if (state.value == null) {
      state = const AsyncLoading();
      state = await AsyncValue.guard(repo.overview);
      return;
    }
    final next = await repo.overview();
    if (ref.mounted) state = AsyncData(next);
  }
}

/// What the status screen shows (docs/03 §6.1, §8.6).
enum VerificationView {
  /// No request yet (or only a stale approved one after licenses expired).
  start,

  /// A draft is being filled in.
  draft,

  /// submitted / in_review.
  pending,
  needsMoreInfo,
  rejected,
  verified,
  suspended,
}

VerificationView viewOf(VerificationOverview o) {
  if (o.status == VerificationStatus.suspended) {
    return VerificationView.suspended;
  }
  if (o.status == VerificationStatus.verified) return VerificationView.verified;
  final r = o.request;
  if (r == null) return VerificationView.start;
  return switch (r.status) {
    RequestStatus.draft => VerificationView.draft,
    RequestStatus.submitted ||
    RequestStatus.inReview =>
      VerificationView.pending,
    RequestStatus.needsMoreInfo => VerificationView.needsMoreInfo,
    RequestStatus.rejected => VerificationView.rejected,
    RequestStatus.approved => VerificationView.start,
  };
}
