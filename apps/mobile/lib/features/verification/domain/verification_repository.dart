import 'package:lawbid/features/verification/domain/selfie_liveness.dart';
import 'package:lawbid/features/verification/domain/verification_models.dart';

/// Attorney verification requests (apps/api `/verification/*`, docs/03
/// §2.1–§2.3). Every failure is an `ApiException`.
abstract interface class VerificationRepository {
  Future<VerificationOverview> overview();

  /// New draft (409 VERIFICATION_ALREADY_PENDING if one is open, 429
  /// VERIFICATION_SUBMISSION_LIMIT when the 30-day budget is used).
  Future<VerificationRequest> create();

  Future<VerificationRequest> get(String requestId);

  Future<VerificationRequest> addLicense(
    String requestId, {
    required String stateCode,
    required String barNumber,
    DateTime? expiresAt,
    bool manualReview = false,
  });

  Future<VerificationRequest> removeLicense(String requestId, String licenseId);

  Future<VerificationRequest> attach(
    String requestId, {
    required String fileId,
    required DocSlot slot,
    String? note,
    SelfieUpload? selfie,
  });

  /// Owner 2026-10-28: a one-time capture token, asked for right before
  /// the guided selfie camera opens; the selfie attach sends it back.
  Future<SelfieCaptureTicket> startSelfieCapture(String requestId);

  /// Owner 2026-10-28: texts the «continue on the phone» link to the
  /// attorney's own number (web / no camera).
  Future<SelfieHandoffResult> sendSelfieHandoffSms(String requestId);

  Future<VerificationRequest> removeDocument(
    String requestId,
    String documentId,
  );

  Future<VerificationRequest> updateComment(String requestId, String comment);

  /// Submit a draft or answer `needs_more_info` (400 VERIFICATION_INCOMPLETE
  /// with `details.missing`).
  /// [attestation]: the attorney ticked the sworn statement (required by
  /// the API for a new submission, owner 2026-10-04).
  Future<VerificationRequest> submit(
    String requestId, {
    String? comment,
    bool attestation = false,
  });
}

/// Cancels an in-flight upload (the data layer bridges it to the HTTP
/// client's own cancel token).
class UploadCancellation {
  final List<void Function()> _listeners = [];
  bool _cancelled = false;

  bool get isCancelled => _cancelled;

  void cancel() {
    if (_cancelled) return;
    _cancelled = true;
    for (final l in List.of(_listeners)) {
      l();
    }
  }

  void onCancel(void Function() listener) {
    if (_cancelled) {
      listener();
    } else {
      _listeners.add(listener);
    }
  }
}

/// Thrown when an upload was cancelled by the user.
class UploadCancelledException implements Exception {
  const UploadCancelledException();
}

/// Pre-signed upload (docs/03 §2.2): presign → direct upload to private
/// storage → confirm → scan status.
abstract interface class FileUploadRepository {
  /// Returns the new file id after the bytes reached storage.
  Future<String> presignAndUpload(
    PickedDocument document, {
    required bool selfie,
    required void Function(double progress) onProgress,
    required UploadCancellation cancellation,
  });

  Future<ScanState> confirm(String fileId);

  Future<ScanState> scanStatus(String fileId);
}

/// A one-time selfie capture token (owner 2026-10-28).
class SelfieCaptureTicket {
  const SelfieCaptureTicket({
    required this.token,
    required this.expiresAt,
    required this.required,
  });

  final String token;
  final DateTime expiresAt;

  /// false = the server would also take a selfie without it (switch off).
  final bool required;
}

/// What goes with a selfie attach: the token and the camera's report.
class SelfieUpload {
  const SelfieUpload({required this.token, this.report});

  final String token;
  final SelfieCaptureReport? report;
}

/// Result of the «continue on the phone» text.
class SelfieHandoffResult {
  const SelfieHandoffResult({
    required this.sent,
    required this.phoneLast4,
    this.reason,
  });

  final bool sent;
  final String phoneLast4;

  /// 'bad_number' | 'suppressed' when not sent.
  final String? reason;
}
