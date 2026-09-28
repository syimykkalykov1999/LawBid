import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/verification/application/verification_overview_controller.dart';
import 'package:lawbid/features/verification/application/verification_wizard_controller.dart';
import 'package:lawbid/features/verification/domain/verification_models.dart';
import 'package:lawbid/features/verification/domain/verification_repository.dart';
import 'package:lawbid/features/verification/verification_providers.dart';

import 'verification_fakes.dart';

/// Upload repo whose scan stays `pending` for [pendingPolls] polls and
/// can fail the storage upload [failUploads] times.
class _ScriptedUploads implements FileUploadRepository {
  _ScriptedUploads(this.inner);

  final FakeVerificationBackend inner;
  int failUploads = 0;
  int pendingPolls = 0;
  int uploads = 0;
  int polls = 0;

  @override
  Future<String> presignAndUpload(
    PickedDocument document, {
    required bool selfie,
    required void Function(double progress) onProgress,
    required UploadCancellation cancellation,
  }) async {
    uploads++;
    if (failUploads > 0) {
      failUploads--;
      throw const ApiException(
        code: ApiErrorCodes.fileNotUploaded,
        message: 'boom',
      );
    }
    return inner.presignAndUpload(
      document,
      selfie: selfie,
      onProgress: onProgress,
      cancellation: cancellation,
    );
  }

  @override
  Future<ScanState> confirm(String fileId) async =>
      pendingPolls > 0 ? ScanState.pending : inner.confirm(fileId);

  @override
  Future<ScanState> scanStatus(String fileId) async {
    polls++;
    if (polls <= pendingPolls) return ScanState.pending;
    return inner.scanStatus(fileId);
  }
}

PickedDocument _file([int size = 16]) => PickedDocument(
      name: 'a.jpg',
      mime: 'image/jpeg',
      bytes: Uint8List(size),
    );

void main() {
  late FakeVerificationBackend backend;
  late _ScriptedUploads uploads;
  late ProviderContainer container;

  ProviderContainer make() {
    final c = ProviderContainer(
      overrides: [
        verificationRepositoryProvider.overrideWithValue(backend),
        fileUploadRepositoryProvider.overrideWithValue(uploads),
        scanPollingProvider.overrideWithValue(
          const ScanPolling(interval: Duration(milliseconds: 1), maxPolls: 3),
        ),
      ],
    );
    addTearDown(c.dispose);
    // Keep the auto-dispose provider alive for the test.
    c.listen(verificationWizardProvider, (_, __) {});
    return c;
  }

  /// Builds the container now (after the test set up the backend).
  Future<WizardState> ready() {
    container = make();
    return container.read(verificationWizardProvider.future);
  }

  VerificationWizardController ctrl() =>
      container.read(verificationWizardProvider.notifier);

  WizardState now() => container.read(verificationWizardProvider).requireValue;

  Future<void> settle() async {
    for (var i = 0; i < 20; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 2));
    }
  }

  setUp(() {
    backend = FakeVerificationBackend();
    uploads = _ScriptedUploads(backend);
  });

  group('resumeStep', () {
    test('empty draft → intro; licenses done → identity; all → review', () {
      expect(
        resumeStep(
          const VerificationRequest(
            id: 'r',
            status: RequestStatus.draft,
            licenses: [],
            documents: [],
          ),
          identityRequired: true,
        ),
        WizardStep.intro,
      );
      expect(resumeStep(draft(), identityRequired: true), WizardStep.identity);
      expect(
        resumeStep(draft(identity: true), identityRequired: true),
        WizardStep.selfie,
      );
      expect(
        resumeStep(draft(identity: true, selfie: true), identityRequired: true),
        WizardStep.review,
      );
      // An already verified attorney adding a state: no ID/selfie steps.
      expect(resumeStep(draft(), identityRequired: false), WizardStep.review);
      expect(
        resumeStep(
          draft(status: RequestStatus.needsMoreInfo),
          identityRequired: true,
        ),
        WizardStep.review,
      );
    });
  });

  test('MissingItem.parse maps the API details', () {
    expect(MissingItem.parse('license'), isA<MissingLicense>());
    expect(
      MissingItem.parse('identity_document_back'),
      isA<MissingIdentity>().having((m) => m.back, 'back', true),
    );
    expect(
      MissingItem.parse('bar_license:NY'),
      isA<MissingBarDocument>().having((m) => m.stateCode, 'state', 'NY'),
    );
    expect(MissingItem.parse('file_not_clean:x'), isA<MissingCleanFile>());
    expect(MissingItem.parse('selfie'), isA<MissingSelfie>());
    expect(MissingItem.parse('something_new'), isNull);
  });

  test('opens the saved draft instead of creating a new one', () async {
    backend.request = draft();
    final s = await ready();
    expect(backend.createCalls, 0);
    expect(s.request.id, 'req-seed');
    expect(s.step, WizardStep.identity);
    expect(s.steps, hasLength(5));
  });

  test('creates a draft when the latest request is closed', () async {
    backend.request = draft(status: RequestStatus.rejected);
    final s = await ready();
    expect(backend.createCalls, 1);
    expect(s.request.isDraft, isTrue);
    expect(s.step, WizardStep.intro);
  });

  test('supplement mode skips intro and allows 3 files per side', () async {
    backend.request = draft(
      identity: true,
      selfie: true,
      status: RequestStatus.needsMoreInfo,
    );
    final s = await ready();
    expect(s.isSupplement, isTrue);
    expect(s.steps.first, WizardStep.licenses);
    expect(s.canAddTo(const DocSlot.selfie()), isTrue);
    expect(s.localMissing, isEmpty);
  });

  test('too-large file is refused before any network call', () async {
    await ready();
    expect(
      () => ctrl().upload(const DocSlot.selfie(), _file(11 * 1024 * 1024)),
      throwsA(
        isA<ApiException>()
            .having((e) => e.code, 'code', ApiErrorCodes.fileTooLarge),
      ),
    );
    expect(uploads.uploads, 0);
  });

  test('scan polling: pending → clean attaches the file', () async {
    backend.request = draft();
    await ready();
    uploads.pendingPolls = 2;
    ctrl().upload(DocSlot.barLicense('AL'), _file());
    await settle();
    expect(uploads.polls, greaterThanOrEqualTo(2));
    expect(now().uploads, isEmpty);
    expect(now().request.docsFor(DocSlot.barLicense('AL')), hasLength(2));
  });

  test(
      'scan that never finishes → failed with ScanTimeoutException, retry '
      'polls again without re-uploading', () async {
    backend.request = draft();
    await ready();
    uploads.pendingPolls = 100;
    ctrl().upload(DocSlot.barLicense('AL'), _file());
    await settle();
    final task = now().uploads.single;
    expect(task.phase, UploadPhase.failed);
    expect(task.error, isA<ScanTimeoutException>());
    expect(now().blocker, SubmitBlocker.uploadsFailed);

    uploads.pendingPolls = 0;
    ctrl().retry(task.localId);
    await settle();
    expect(uploads.uploads, 1, reason: 'the stored file is reused');
    expect(now().uploads, isEmpty);
  });

  test('failed storage upload → retry uploads again', () async {
    backend.request = draft();
    await ready();
    uploads.failUploads = 1;
    ctrl().upload(DocSlot.barLicense('AL'), _file());
    await settle();
    final task = now().uploads.single;
    expect(task.phase, UploadPhase.failed);
    ctrl().retry(task.localId);
    await settle();
    expect(uploads.uploads, 2);
    expect(now().uploads, isEmpty);
  });

  test('cancel stops an in-flight upload and nothing is attached', () async {
    backend.request = draft();
    await ready();
    final gate = Completer<void>();
    backend.uploadGate = gate;
    ctrl().upload(const DocSlot.selfie(), _file());
    await settle();
    expect(now().uploads.single.phase, UploadPhase.uploading);
    expect(now().blocker, SubmitBlocker.uploadsInProgress);
    ctrl().cancel(now().uploads.single.localId);
    gate.complete();
    await settle();
    expect(now().uploads, isEmpty);
    expect(backend.attached, isEmpty);
  });

  test('infected scan → blocked task, never attached', () async {
    backend.request = draft();
    await ready();
    backend.nextScan = ScanState.infected;
    ctrl().upload(DocSlot.barLicense('AL'), _file());
    await settle();
    expect(now().uploads.single.phase, UploadPhase.infected);
    expect(now().blocker, SubmitBlocker.uploadsFailed);
    expect(backend.attached, isEmpty);
    // An infected file can't be "retried" — only removed.
    ctrl().retry(now().uploads.single.localId);
    expect(now().uploads.single.phase, UploadPhase.infected);
  });

  test('VERIFICATION_INCOMPLETE details surface as missing items', () async {
    final failing = _IncompleteBackend();
    backend = failing;
    uploads = _ScriptedUploads(backend);
    await ready();
    await expectLater(
      ctrl().submit(''),
      throwsA(isA<ApiException>()),
    );
    expect(now().missing.whereType<MissingSelfie>(), hasLength(1));
    expect(now().missing.whereType<MissingBarDocument>(), hasLength(1));
  });

  test('viewOf maps profile + request status', () {
    VerificationOverview o(VerificationStatus s, [RequestStatus? r]) =>
        VerificationOverview(
          status: s,
          request: r == null ? null : draft(status: r),
          identityRequired: true,
          submissionsLast30Days: 0,
          maxSubmissions30Days: 5,
        );
    expect(viewOf(o(VerificationStatus.unverified)), VerificationView.start);
    expect(
      viewOf(o(VerificationStatus.unverified, RequestStatus.draft)),
      VerificationView.draft,
    );
    expect(
      viewOf(o(VerificationStatus.pending, RequestStatus.inReview)),
      VerificationView.pending,
    );
    expect(
      viewOf(o(VerificationStatus.pending, RequestStatus.needsMoreInfo)),
      VerificationView.needsMoreInfo,
    );
    expect(
      viewOf(o(VerificationStatus.rejected, RequestStatus.rejected)),
      VerificationView.rejected,
    );
    expect(
      viewOf(o(VerificationStatus.verified, RequestStatus.submitted)),
      VerificationView.verified,
    );
    expect(
      viewOf(o(VerificationStatus.suspended)),
      VerificationView.suspended,
    );
  });
}

class _IncompleteBackend extends FakeVerificationBackend {
  @override
  Future<VerificationRequest> submit(String requestId, {String? comment}) =>
      throw const ApiException(
        code: ApiErrorCodes.verificationIncomplete,
        message: 'incomplete',
        details: {
          'missing': ['selfie', 'bar_license:NY', 42],
        },
      );
}
