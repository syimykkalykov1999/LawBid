import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/verification/domain/verification_models.dart';
import 'package:lawbid/features/verification/domain/verification_repository.dart';
import 'package:lawbid/features/verification/presentation/document_source.dart';
import 'package:lawbid/features/verification/presentation/screens/verification_status_screen.dart';
import 'package:lawbid/features/verification/presentation/screens/verification_wizard_screen.dart';
import 'package:lawbid/features/verification/verification_providers.dart';

import '../../helpers/ux_harness.dart';

const _states = {'AL': 'Alabama', 'AK': 'Alaska', 'NY': 'New York'};

/// In-memory stand-in for `/verification/*` + `/files/*` with the API's
/// own rules (completeness, editable statuses, scan results).
class FakeVerificationBackend
    implements VerificationRepository, FileUploadRepository {
  FakeVerificationBackend({
    this.status = VerificationStatus.unverified,
    this.request,
    this.identityRequired = true,
    this.submissionsLast30Days = 0,
    this.maxSubmissions30Days = 5,
  });

  VerificationStatus status;
  VerificationRequest? request;
  bool identityRequired;
  int submissionsLast30Days;
  int maxSubmissions30Days;

  /// Scan result the next uploads get.
  ScanState nextScan = ScanState.clean;

  /// While set, uploads wait on it (an "unfinished" upload).
  Completer<void>? uploadGate;

  int createCalls = 0;
  int submitCalls = 0;
  String? lastComment;
  final List<DocSlot> attached = [];
  final Map<String, ScanState> _files = {};
  int _seq = 0;

  String _id(String p) => '$p-${_seq++}';

  VerificationRequest _copy({
    RequestStatus? status,
    List<VerificationLicense>? licenses,
    List<VerificationDocument>? documents,
    String? comment,
    DateTime? submittedAt,
  }) {
    final r = request!;
    return VerificationRequest(
      id: r.id,
      status: status ?? r.status,
      licenses: licenses ?? r.licenses,
      documents: documents ?? r.documents,
      applicantComment: comment ?? r.applicantComment,
      infoRequestMessage: r.infoRequestMessage,
      rejectionCode: r.rejectionCode,
      rejectionReason: r.rejectionReason,
      submittedAt: submittedAt ?? r.submittedAt,
    );
  }

  @override
  Future<VerificationOverview> overview() async => VerificationOverview(
        status: status,
        request: request,
        identityRequired: identityRequired,
        submissionsLast30Days: submissionsLast30Days,
        maxSubmissions30Days: maxSubmissions30Days,
      );

  @override
  Future<VerificationRequest> create() async {
    createCalls++;
    final carried =
        request?.licenses.where((l) => l.status != LicenseStatus.pending);
    request = VerificationRequest(
      id: _id('req'),
      status: RequestStatus.draft,
      licenses: [...?carried],
      documents: const [],
    );
    if (status == VerificationStatus.rejected) {
      status = VerificationStatus.unverified;
    }
    return request!;
  }

  @override
  Future<VerificationRequest> get(String requestId) async => request!;

  @override
  Future<VerificationRequest> addLicense(
    String requestId, {
    required String stateCode,
    required String barNumber,
    DateTime? expiresAt,
  }) async {
    if (barNumber == 'TAKEN') {
      throw const ApiException(
        code: ApiErrorCodes.licenseAlreadyRegistered,
        message: 'taken',
      );
    }
    request = _copy(
      licenses: [
        ...request!.licenses,
        VerificationLicense(
          id: _id('lic'),
          stateCode: stateCode,
          stateName: _states[stateCode] ?? stateCode,
          barNumber: barNumber,
          status: LicenseStatus.pending,
          expiresAt: expiresAt,
        ),
      ],
    );
    return request!;
  }

  @override
  Future<VerificationRequest> removeLicense(
    String requestId,
    String licenseId,
  ) async {
    final l = request!.licenses.firstWhere((l) => l.id == licenseId);
    request = _copy(
      licenses: request!.licenses.where((x) => x.id != licenseId).toList(),
      documents:
          request!.documents.where((d) => d.stateCode != l.stateCode).toList(),
    );
    return request!;
  }

  @override
  Future<VerificationRequest> attach(
    String requestId, {
    required String fileId,
    required DocSlot slot,
  }) async {
    if (_files[fileId] != ScanState.clean) {
      throw const ApiException(
        code: ApiErrorCodes.fileNotAttachable,
        message: 'not clean',
      );
    }
    attached.add(slot);
    request = _copy(
      documents: [...request!.documents, doc(slot, id: _id('doc'))],
    );
    return request!;
  }

  @override
  Future<VerificationRequest> removeDocument(
    String requestId,
    String documentId,
  ) async {
    request = _copy(
      documents: request!.documents.where((d) => d.id != documentId).toList(),
    );
    return request!;
  }

  @override
  Future<VerificationRequest> updateComment(
    String requestId,
    String comment,
  ) async {
    request = _copy(comment: comment);
    return request!;
  }

  @override
  Future<VerificationRequest> submit(
    String requestId, {
    String? comment,
  }) async {
    submitCalls++;
    lastComment = comment;
    request = _copy(
      status: RequestStatus.submitted,
      submittedAt: DateTime.utc(2026, 9, 27),
    );
    status = status == VerificationStatus.verified
        ? status
        : VerificationStatus.pending;
    return request!;
  }

  @override
  Future<String> presignAndUpload(
    PickedDocument document, {
    required bool selfie,
    required void Function(double progress) onProgress,
    required UploadCancellation cancellation,
  }) async {
    onProgress(0.4);
    final gate = uploadGate;
    if (gate != null) await gate.future;
    if (cancellation.isCancelled) throw const UploadCancelledException();
    onProgress(1);
    final id = _id('file');
    _files[id] = nextScan;
    return id;
  }

  @override
  Future<ScanState> confirm(String fileId) async => _files[fileId]!;

  @override
  Future<ScanState> scanStatus(String fileId) async => _files[fileId]!;
}

VerificationDocument doc(DocSlot slot, {String? id}) => VerificationDocument(
      id: id ?? 'doc-${slot.hashCode}',
      kind: slot.kind,
      fileId: 'file-${slot.hashCode}',
      side: slot.side,
      stateCode: slot.stateCode,
    );

VerificationLicense license(
  String state, {
  LicenseStatus status = LicenseStatus.pending,
  String? rejectionCode,
}) =>
    VerificationLicense(
      id: 'lic-$state',
      stateCode: state,
      stateName: _states[state] ?? state,
      barNumber: 'B$state',
      status: status,
      rejectionCode: rejectionCode,
    );

/// Returns picked files without a camera or file system.
class FakeDocumentSource implements DocumentSource {
  int captures = 0;
  int picks = 0;

  PickedDocument _doc(String name) => PickedDocument(
        name: name,
        mime: 'image/jpeg',
        bytes: Uint8List.fromList(List<int>.filled(64, 7)),
      );

  @override
  Future<PickedDocument?> capture(
    BuildContext context,
    CaptureGuide guide,
  ) async {
    captures++;
    return _doc(guide == CaptureGuide.selfie ? 'selfie.jpg' : 'photo.jpg');
  }

  @override
  Future<PickedDocument?> pickFile({required bool allowPdf}) async {
    picks++;
    return _doc('license.jpg');
  }
}

/// Status + wizard routes in a real GoRouter (the wizard pops back to
/// the status screen after submit).
Widget verificationApp({
  required FakeVerificationBackend backend,
  required ThemeData theme,
  FakeDocumentSource? source,
  String initial = AppRoutes.verification,
  bool disableAnimations = true,
  double textScale = 1,
  List<Override> extra = const [],
}) {
  final router = GoRouter(
    initialLocation: initial,
    routes: [
      GoRoute(
        path: AppRoutes.verification,
        builder: (_, __) => const VerificationStatusScreen(),
      ),
      GoRoute(
        path: AppRoutes.verificationWizard,
        builder: (_, __) => const VerificationWizardScreen(),
      ),
    ],
  );
  return ProviderScope(
    overrides: uxOverrides(
      extra: [
        verificationRepositoryProvider.overrideWithValue(backend),
        fileUploadRepositoryProvider.overrideWithValue(backend),
        documentSourceProvider
            .overrideWithValue(source ?? FakeDocumentSource()),
        scanPollingProvider.overrideWithValue(
          const ScanPolling(interval: Duration(milliseconds: 10), maxPolls: 3),
        ),
        ...extra,
      ],
    ),
    child: MaterialApp.router(
      debugShowCheckedModeBanner: false,
      theme: theme,
      routerConfig: router,
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          disableAnimations: disableAnimations,
          textScaler: TextScaler.linear(textScale),
        ),
        child: child!,
      ),
    ),
  );
}

/// A draft with [states] licensed (bar documents attached) and,
/// optionally, the identity document and selfie.
VerificationRequest draft({
  List<String> states = const ['AL'],
  bool identity = false,
  bool selfie = false,
  RequestStatus status = RequestStatus.draft,
  String? infoMessage,
}) =>
    VerificationRequest(
      id: 'req-seed',
      status: status,
      infoRequestMessage: infoMessage,
      licenses: [for (final s in states) license(s)],
      documents: [
        for (final s in states) doc(DocSlot.barLicense(s), id: 'doc-bar-$s'),
        if (identity) ...[
          doc(
            DocSlot.identity(IdDocumentType.driversLicense, DocSide.front),
            id: 'doc-id-front',
          ),
          doc(
            DocSlot.identity(IdDocumentType.driversLicense, DocSide.back),
            id: 'doc-id-back',
          ),
        ],
        if (selfie) doc(const DocSlot.selfie(), id: 'doc-selfie'),
      ],
    );
