import 'dart:typed_data';

/// Attorney verification (docs/03 §2, §6) — domain types the wizard and
/// the status screen work with. Presentation never sees the generated wire
/// DTOs (docs/01 §6.4); `data/verification_mapper.dart` converts.

/// `attorney_profiles.verification_status` (docs/03 §6.1).
enum VerificationStatus { unverified, pending, verified, rejected, suspended }

/// `verification_requests.status` (docs/03 §2.3).
enum RequestStatus {
  draft,
  submitted,
  inReview,
  needsMoreInfo,
  approved,
  rejected
}

/// `attorney_licenses.license_status`.
enum LicenseStatus { pending, verified, rejected, expired, suspended }

/// `verification_documents.doc_type` the app can attach.
enum DocKind { barLicense, driversLicense, passport, stateId, selfie, other }

enum DocSide { front, back }

/// The identity documents of docs/03 §2.1 ("driver license, passport,
/// state ID"). Back side needed for driver license and state ID.
enum IdDocumentType {
  driversLicense(DocKind.driversLicense, needsBack: true),
  passport(DocKind.passport, needsBack: false),
  stateId(DocKind.stateId, needsBack: true);

  const IdDocumentType(this.kind, {required this.needsBack});

  final DocKind kind;
  final bool needsBack;

  static IdDocumentType? ofKind(DocKind kind) {
    for (final t in values) {
      if (t.kind == kind) return t;
    }
    return null;
  }
}

/// One "document" of a request that files are attached to: the bar
/// document of a state, one side of an identity document, or the selfie.
/// docs/03 §2.2: up to 3 files per document.
class DocSlot {
  const DocSlot._(this.kind, {this.side, this.stateCode});

  const DocSlot.barLicense(String state)
      : this._(DocKind.barLicense, stateCode: state);
  DocSlot.identity(IdDocumentType type, DocSide side)
      : this._(type.kind, side: side);
  const DocSlot.selfie() : this._(DocKind.selfie);

  final DocKind kind;
  final DocSide? side;
  final String? stateCode;

  static const maxFiles = 3;

  bool matches(VerificationDocument d) =>
      d.kind == kind &&
      (kind == DocKind.barLicense
          ? d.stateCode == stateCode
          : side == null || (d.side ?? DocSide.front) == side);

  @override
  // ignore: avoid_equals_and_hash_code_on_mutable_classes
  bool operator ==(Object other) =>
      other is DocSlot &&
      other.kind == kind &&
      other.side == side &&
      other.stateCode == stateCode;

  @override
  // ignore: avoid_equals_and_hash_code_on_mutable_classes
  int get hashCode => Object.hash(kind, side, stateCode);

  @override
  String toString() => 'DocSlot($kind, $side, $stateCode)';
}

class VerificationLicense {
  const VerificationLicense({
    required this.id,
    required this.stateCode,
    required this.stateName,
    required this.barNumber,
    required this.status,
    this.expiresAt,
    this.rejectionCode,
    this.rejectionNote,
  });

  final String id;
  final String stateCode;
  final String stateName;

  /// Shown to its owner only (docs/03 §6.2).
  final String barNumber;
  final LicenseStatus status;
  final DateTime? expiresAt;
  final String? rejectionCode;
  final String? rejectionNote;
}

class VerificationDocument {
  const VerificationDocument({
    required this.id,
    required this.kind,
    required this.fileId,
    this.side,
    this.stateCode,
  });

  final String id;
  final DocKind kind;
  final String fileId;
  final DocSide? side;
  final String? stateCode;
}

class VerificationRequest {
  const VerificationRequest({
    required this.id,
    required this.status,
    required this.licenses,
    required this.documents,
    this.applicantComment,
    this.infoRequestMessage,
    this.rejectionCode,
    this.rejectionReason,
    this.submittedAt,
    this.reviewedAt,
  });

  final String id;
  final RequestStatus status;
  final String? applicantComment;

  /// The verifier's message of `needs_more_info`.
  final String? infoRequestMessage;
  final String? rejectionCode;
  final String? rejectionReason;
  final DateTime? submittedAt;
  final DateTime? reviewedAt;

  /// All of the attorney's licenses; the ones in `pending` belong to this
  /// (open) request.
  final List<VerificationLicense> licenses;
  final List<VerificationDocument> documents;

  /// docs/03 §2.3: the attorney changes a request in `draft` and answers
  /// `needs_more_info`; documents are removed only from a draft.
  bool get isEditable =>
      status == RequestStatus.draft || status == RequestStatus.needsMoreInfo;
  bool get isDraft => status == RequestStatus.draft;

  List<VerificationLicense> get pendingLicenses =>
      licenses.where((l) => l.status == LicenseStatus.pending).toList();

  List<VerificationDocument> docsFor(DocSlot slot) =>
      documents.where(slot.matches).toList();

  /// The identity document type already chosen (first uploaded one).
  IdDocumentType? get identityType {
    for (final d in documents) {
      final t = IdDocumentType.ofKind(d.kind);
      if (t != null) return t;
    }
    return null;
  }

  bool get licensesComplete {
    final pending = pendingLicenses;
    return pending.isNotEmpty &&
        pending.every(
          (l) => docsFor(DocSlot.barLicense(l.stateCode)).isNotEmpty,
        );
  }

  /// Same rule as the API's identityCompleteness: some identity type has
  /// its front, plus back where needed.
  bool get identityComplete {
    for (final type in IdDocumentType.values) {
      final front = docsFor(DocSlot.identity(type, DocSide.front)).isNotEmpty;
      final back = docsFor(DocSlot.identity(type, DocSide.back)).isNotEmpty;
      if (front && (back || !type.needsBack)) return true;
    }
    return false;
  }

  bool get selfieComplete => docsFor(const DocSlot.selfie()).isNotEmpty;
}

/// `GET /verification/me` (status screen, docs/03 §8.6).
class VerificationOverview {
  const VerificationOverview({
    required this.status,
    required this.identityRequired,
    required this.submissionsLast30Days,
    required this.maxSubmissions30Days,
    this.request,
  });

  final VerificationStatus status;
  final VerificationRequest? request;

  /// false for an already verified attorney adding a state (§2.1).
  final bool identityRequired;
  final int submissionsLast30Days;
  final int maxSubmissions30Days;

  bool get submissionLimitReached =>
      submissionsLast30Days >= maxSubmissions30Days;
}

/// A file chosen or captured on the device, ready to upload.
class PickedDocument {
  const PickedDocument({
    required this.name,
    required this.mime,
    required this.bytes,
  });

  final String name;
  final String mime;
  final Uint8List bytes;

  int get sizeBytes => bytes.length;
  bool get isPdf => mime == 'application/pdf';
}

/// MIME from a file name (docs/03 §2.2: JPEG, PNG, HEIC, PDF), or null.
String? mimeForFileName(String name) {
  final dot = name.lastIndexOf('.');
  final ext = dot < 0 ? '' : name.substring(dot + 1).toLowerCase();
  return switch (ext) {
    'jpg' || 'jpeg' => 'image/jpeg',
    'png' => 'image/png',
    'heic' || 'heif' => 'image/heic',
    'pdf' => 'application/pdf',
    _ => null,
  };
}

/// Server scan state of an uploaded file (`files.scan_status`).
enum ScanState { pending, clean, infected, failed }

/// What the API says is missing on submit (VERIFICATION_INCOMPLETE
/// `details.missing`, apps/api verification-requests.service.ts).
sealed class MissingItem {
  const MissingItem();

  static MissingItem? parse(String raw) {
    if (raw == 'license') return const MissingLicense();
    if (raw == 'identity_document') return const MissingIdentity(back: false);
    if (raw == 'identity_document_back') {
      return const MissingIdentity(back: true);
    }
    if (raw == 'selfie') return const MissingSelfie();
    if (raw.startsWith('bar_license:')) {
      return MissingBarDocument(raw.substring('bar_license:'.length));
    }
    if (raw.startsWith('file_not_clean:')) return const MissingCleanFile();
    return null;
  }
}

class MissingLicense extends MissingItem {
  const MissingLicense();
}

class MissingIdentity extends MissingItem {
  const MissingIdentity({required this.back});
  final bool back;
}

class MissingSelfie extends MissingItem {
  const MissingSelfie();
}

class MissingBarDocument extends MissingItem {
  const MissingBarDocument(this.stateCode);
  final String stateCode;
}

class MissingCleanFile extends MissingItem {
  const MissingCleanFile();
}
