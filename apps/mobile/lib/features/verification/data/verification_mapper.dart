import 'package:lawbid/features/verification/domain/selfie_liveness.dart';
import 'package:lawbid/features/verification/domain/verification_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Generated wire DTOs (`package:lawbid_api`) → domain types.
abstract final class VerificationMapper {
  static VerificationOverview overview(api.VerificationOverviewDto dto) =>
      VerificationOverview(
        status: switch (dto.verificationStatus) {
          api.VerificationStatus.pending => VerificationStatus.pending,
          api.VerificationStatus.verified => VerificationStatus.verified,
          api.VerificationStatus.rejected => VerificationStatus.rejected,
          api.VerificationStatus.suspended => VerificationStatus.suspended,
          _ => VerificationStatus.unverified,
        },
        request: dto.request == null ? null : request(dto.request!),
        identityRequired: dto.identityRequired,
        barDocumentRequired: dto.barDocumentRequired,
        barAttemptsRetryAfterSeconds: dto.barAttemptsRetryAfterSeconds,
        submissionsLast30Days: dto.submissionsLast30Days,
        maxSubmissions30Days: dto.maxSubmissions30Days,
      );

  static VerificationRequest request(api.VerificationRequestDto dto) =>
      VerificationRequest(
        id: dto.id,
        status: switch (dto.status) {
          api.VerificationRequestStatus.submitted => RequestStatus.submitted,
          api.VerificationRequestStatus.inReview => RequestStatus.inReview,
          api.VerificationRequestStatus.needsMoreInfo =>
            RequestStatus.needsMoreInfo,
          api.VerificationRequestStatus.approved => RequestStatus.approved,
          api.VerificationRequestStatus.rejected => RequestStatus.rejected,
          _ => RequestStatus.draft,
        },
        applicantComment: dto.applicantComment,
        infoRequestMessage: dto.infoRequestMessage,
        rejectionCode: dto.rejectionCode,
        rejectionReason: dto.rejectionReason,
        submittedAt: dto.submittedAt,
        reviewedAt: dto.reviewedAt,
        licenses: [
          for (final l in dto.licenses)
            VerificationLicense(
              id: l.id,
              stateCode: l.state.code,
              stateName: l.state.name,
              barNumber: l.barNumber,
              status: switch (l.status) {
                api.LicenseStatus.verified => LicenseStatus.verified,
                api.LicenseStatus.rejected => LicenseStatus.rejected,
                api.LicenseStatus.expired => LicenseStatus.expired,
                api.LicenseStatus.suspended => LicenseStatus.suspended,
                _ => LicenseStatus.pending,
              },
              expiresAt: l.expiresAt,
              rejectionCode: l.rejectionCode,
              rejectionNote: l.rejectionNote,
              manualReview: l.manualReview,
            ),
        ],
        documents: [
          for (final d in dto.documents)
            VerificationDocument(
              id: d.id,
              kind: docKind(d.docType),
              fileId: d.fileId,
              side: switch (d.side) {
                api.OwnVerificationDocumentDtoSide.back => DocSide.back,
                api.OwnVerificationDocumentDtoSide.front => DocSide.front,
                _ => null,
              },
              stateCode: d.stateCode,
            ),
        ],
      );

  static DocKind docKind(api.VerificationDocType t) => switch (t) {
        api.VerificationDocType.barLicense => DocKind.barLicense,
        api.VerificationDocType.driversLicense => DocKind.driversLicense,
        api.VerificationDocType.passport => DocKind.passport,
        api.VerificationDocType.stateId => DocKind.stateId,
        api.VerificationDocType.selfie => DocKind.selfie,
        _ => DocKind.other,
      };

  static api.VerificationDocType wireDocType(DocKind k) => switch (k) {
        DocKind.barLicense => api.VerificationDocType.barLicense,
        DocKind.driversLicense => api.VerificationDocType.driversLicense,
        DocKind.passport => api.VerificationDocType.passport,
        DocKind.stateId => api.VerificationDocType.stateId,
        DocKind.selfie => api.VerificationDocType.selfie,
        DocKind.other => api.VerificationDocType.other,
      };

  static ScanState scan(api.ScanStatus s) => switch (s) {
        api.ScanStatus.clean => ScanState.clean,
        api.ScanStatus.infected => ScanState.infected,
        api.ScanStatus.failed => ScanState.failed,
        _ => ScanState.pending,
      };

  /// Owner 2026-10-28: the guided selfie camera's report on the wire.
  static api.SelfieCaptureMetaDto? captureMeta(SelfieCaptureReport? r) {
    if (r == null) return null;
    return api.SelfieCaptureMetaDto(
      liveness: switch (r.liveness) {
        LivenessResult.passed => api.SelfieCaptureMetaDtoLiveness.passed,
        LivenessResult.notChecked =>
          api.SelfieCaptureMetaDtoLiveness.notChecked,
        LivenessResult.skipped => api.SelfieCaptureMetaDtoLiveness.skipped,
      },
      challenge: switch (r.challenge) {
        LivenessChallenge.blink => api.SelfieCaptureMetaDtoChallenge.blink,
        LivenessChallenge.turnLeft =>
          api.SelfieCaptureMetaDtoChallenge.turnLeft,
        LivenessChallenge.turnRight =>
          api.SelfieCaptureMetaDtoChallenge.turnRight,
        null => null,
      },
      fallbackReason: switch (r.fallbackReason) {
        'timeout' => api.SelfieCaptureMetaDtoFallbackReason.timeout,
        'detector_unavailable' =>
          api.SelfieCaptureMetaDtoFallbackReason.detectorUnavailable,
        _ => null,
      },
      faceDetected: r.faceDetected,
      cardDetected: r.cardDetected,
      framesCaptured: r.framesCaptured.clamp(1, 5),
      startedAt: r.startedAt.toUtc(),
      capturedAt: r.capturedAt.toUtc(),
      platform: switch (r.platform) {
        'ios' => api.SelfieCaptureMetaDtoPlatform.ios,
        'web' => api.SelfieCaptureMetaDtoPlatform.web,
        _ => api.SelfieCaptureMetaDtoPlatform.android,
      },
      deviceModel: r.deviceModel == null
          ? null
          : (r.deviceModel!.length > 80
              ? r.deviceModel!.substring(0, 80)
              : r.deviceModel),
    );
  }
}
