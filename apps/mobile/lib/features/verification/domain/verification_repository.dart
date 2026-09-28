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
  });

  Future<VerificationRequest> removeLicense(String requestId, String licenseId);

  Future<VerificationRequest> attach(
    String requestId, {
    required String fileId,
    required DocSlot slot,
  });

  Future<VerificationRequest> removeDocument(
    String requestId,
    String documentId,
  );

  Future<VerificationRequest> updateComment(String requestId, String comment);

  /// Submit a draft or answer `needs_more_info` (400 VERIFICATION_INCOMPLETE
  /// with `details.missing`).
  Future<VerificationRequest> submit(String requestId, {String? comment});
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
