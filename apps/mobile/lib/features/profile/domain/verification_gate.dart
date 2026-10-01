import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';

/// docs/03 §1, §6.1, §6.4: an attorney whose status is not `verified`
/// (unverified / pending / rejected / suspended) may not use the Cases tab,
/// pick practices or post to the feed. Decided from `GET /users/me`; while
/// me has no attorney profile yet, [tokenVerified] (the access token's
/// `verified` claim) decides. Clients are never gated.
bool attorneyNeedsVerification(CurrentUser? user,
    {bool tokenVerified = false}) {
  if (user == null || !user.isAttorney) return false;
  final status = user.attorneyProfile?.verificationStatus;
  if (status == null) return !tokenVerified;
  return !AttorneyVerification.parse(status).isVerified;
}
