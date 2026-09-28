import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/verification/domain/verification_models.dart';
import 'package:lawbid/features/verification/domain/verification_repository.dart';
import 'package:lawbid/features/verification/verification_providers.dart';

/// Wizard steps (docs/03 §8 "Верификация", 1–5).
enum WizardStep { intro, licenses, identity, selfie, review }

enum UploadPhase { uploading, scanning, attaching, failed, infected }

/// A file on its way into the request: upload → confirm/scan → attach.
/// Once attached it disappears from here and lives in the request.
class UploadTask {
  const UploadTask({
    required this.localId,
    required this.slot,
    required this.document,
    required this.phase,
    this.progress = 0,
    this.fileId,
    this.error,
  });

  final String localId;
  final DocSlot slot;
  final PickedDocument document;
  final UploadPhase phase;
  final double progress;
  final String? fileId;
  final Object? error;

  bool get isActive =>
      phase == UploadPhase.uploading ||
      phase == UploadPhase.scanning ||
      phase == UploadPhase.attaching;

  UploadTask copyWith({
    UploadPhase? phase,
    double? progress,
    String? fileId,
    Object? error,
  }) =>
      UploadTask(
        localId: localId,
        slot: slot,
        document: document,
        phase: phase ?? this.phase,
        progress: progress ?? this.progress,
        fileId: fileId ?? this.fileId,
        error: error,
      );
}

/// Scan still `pending` after [ScanPolling.maxPolls].
class ScanTimeoutException implements Exception {
  const ScanTimeoutException();
}

/// Why submit is blocked on the device (checked before any API call).
enum SubmitBlocker { uploadsInProgress, uploadsFailed }

class WizardState {
  const WizardState({
    required this.request,
    required this.identityRequired,
    required this.step,
    required this.idType,
    this.uploads = const [],
    this.missing = const [],
  });

  final VerificationRequest request;
  final bool identityRequired;
  final WizardStep step;
  final IdDocumentType idType;
  final List<UploadTask> uploads;

  /// VERIFICATION_INCOMPLETE items from the last submit attempt.
  final List<MissingItem> missing;

  /// An answer to `needs_more_info` (no intro, only additions).
  bool get isSupplement => request.status == RequestStatus.needsMoreInfo;

  List<WizardStep> get steps => [
        if (!isSupplement) WizardStep.intro,
        WizardStep.licenses,
        if (identityRequired) ...[WizardStep.identity, WizardStep.selfie],
        WizardStep.review,
      ];

  int get stepIndex => steps.indexOf(step);

  List<UploadTask> tasksFor(DocSlot slot) =>
      uploads.where((u) => u.slot == slot).toList();

  /// Files counted against the 3-per-document limit (docs/03 §2.2).
  int filesIn(DocSlot slot) =>
      request.docsFor(slot).length +
      tasksFor(slot).where((u) => u.phase != UploadPhase.infected).length;

  /// In a draft each identity side/selfie takes one file (replace by
  /// removing); licenses and answers to an info request take up to 3.
  int capacityOf(DocSlot slot) =>
      request.isDraft && slot.kind != DocKind.barLicense ? 1 : DocSlot.maxFiles;

  bool canAddTo(DocSlot slot) => filesIn(slot) < capacityOf(slot);

  SubmitBlocker? get blocker {
    if (uploads.any((u) => u.isActive)) return SubmitBlocker.uploadsInProgress;
    if (uploads.isNotEmpty) return SubmitBlocker.uploadsFailed;
    return null;
  }

  /// What a new submission still lacks, computed on the device with the
  /// API's own rule (docs/03 §2.1). Empty for an info-request answer.
  List<MissingItem> get localMissing {
    if (!request.isDraft) return const [];
    final out = <MissingItem>[];
    final pending = request.pendingLicenses;
    if (pending.isEmpty) out.add(const MissingLicense());
    for (final l in pending) {
      if (request.docsFor(DocSlot.barLicense(l.stateCode)).isEmpty) {
        out.add(MissingBarDocument(l.stateCode));
      }
    }
    if (identityRequired) {
      if (!request.identityComplete) {
        final front =
            request.docsFor(DocSlot.identity(idType, DocSide.front)).isNotEmpty;
        out.add(MissingIdentity(back: front));
      }
      if (!request.selfieComplete) out.add(const MissingSelfie());
    }
    return out;
  }

  WizardState copyWith({
    VerificationRequest? request,
    WizardStep? step,
    IdDocumentType? idType,
    List<UploadTask>? uploads,
    List<MissingItem>? missing,
  }) =>
      WizardState(
        request: request ?? this.request,
        identityRequired: identityRequired,
        step: step ?? this.step,
        idType: idType ?? this.idType,
        uploads: uploads ?? this.uploads,
        missing: missing ?? this.missing,
      );
}

/// Where to reopen a saved draft (docs/03 §8: the draft lives on the
/// server, so closing the app at any step resumes at the first step that
/// is not complete yet).
WizardStep resumeStep(VerificationRequest r, {required bool identityRequired}) {
  if (r.status == RequestStatus.needsMoreInfo) return WizardStep.review;
  if (r.pendingLicenses.isEmpty && r.documents.isEmpty) return WizardStep.intro;
  if (!r.licensesComplete) return WizardStep.licenses;
  if (identityRequired && !r.identityComplete) return WizardStep.identity;
  if (identityRequired && !r.selfieComplete) return WizardStep.selfie;
  return WizardStep.review;
}

final verificationWizardProvider = AsyncNotifierProvider.autoDispose<
    VerificationWizardController, WizardState>(
  VerificationWizardController.new,
  retry: (retryCount, error) => null,
);

/// Drives the verification wizard: opens the editable request (the saved
/// draft, the request awaiting more info, or a new draft), uploads files
/// through presign → storage → confirm → scan → attach with progress,
/// retry and cancel, and submits.
class VerificationWizardController extends AsyncNotifier<WizardState> {
  VerificationRepository get _repo => ref.read(verificationRepositoryProvider);
  FileUploadRepository get _files => ref.read(fileUploadRepositoryProvider);

  final Map<String, UploadCancellation> _cancellations = {};
  int _seq = 0;

  @override
  Future<WizardState> build() async {
    ref.onDispose(() {
      for (final c in _cancellations.values) {
        c.cancel();
      }
    });
    final repo = ref.watch(verificationRepositoryProvider);
    final overview = await repo.overview();
    final existing = overview.request;
    final request = existing != null && existing.isEditable
        ? existing
        : await repo.create();
    return WizardState(
      request: request,
      identityRequired: overview.identityRequired,
      step: resumeStep(request, identityRequired: overview.identityRequired),
      idType: request.identityType ?? IdDocumentType.driversLicense,
    );
  }

  WizardState? get _s => state.value;

  void _emit(WizardState next) {
    if (ref.mounted) state = AsyncData(next);
  }

  void goTo(WizardStep step) {
    final s = _s;
    if (s == null || !s.steps.contains(step)) return;
    _emit(s.copyWith(step: step));
  }

  void next() {
    final s = _s;
    if (s == null) return;
    final i = s.stepIndex;
    if (i < s.steps.length - 1) _emit(s.copyWith(step: s.steps[i + 1]));
  }

  /// Returns false on the first step (the screen then closes).
  bool back() {
    final s = _s;
    if (s == null || s.stepIndex <= 0) return false;
    _emit(s.copyWith(step: s.steps[s.stepIndex - 1]));
    return true;
  }

  /// The type can change only while none of its sides has a file.
  void selectIdType(IdDocumentType type) {
    final s = _s;
    if (s == null) return;
    _emit(s.copyWith(idType: type));
  }

  Future<void> addLicense({
    required String stateCode,
    required String barNumber,
    DateTime? expiresAt,
  }) async {
    final s = _s;
    if (s == null) return;
    final r = await _repo.addLicense(
      s.request.id,
      stateCode: stateCode,
      barNumber: barNumber,
      expiresAt: expiresAt,
    );
    _setRequest(r);
  }

  Future<void> removeLicense(VerificationLicense license) async {
    final s = _s;
    if (s == null) return;
    final slot = DocSlot.barLicense(license.stateCode);
    for (final t in s.tasksFor(slot)) {
      cancel(t.localId);
    }
    _setRequest(await _repo.removeLicense(s.request.id, license.id));
  }

  Future<void> removeDocument(String documentId) async {
    final s = _s;
    if (s == null) return;
    _setRequest(await _repo.removeDocument(s.request.id, documentId));
  }

  /// Best effort (the comment is also sent with submit).
  Future<void> saveComment(String comment) async {
    final s = _s;
    if (s == null) return;
    try {
      _setRequest(await _repo.updateComment(s.request.id, comment));
    } on Object {
      // Kept locally; submit sends it again.
    }
  }

  /// Starts uploading [document] into [slot]. Too large → throws an
  /// [ApiException] (`FILE_TOO_LARGE`) before any network call.
  void upload(DocSlot slot, PickedDocument document,
      {int maxBytes = _maxBytes}) {
    final s = _s;
    if (s == null) return;
    if (document.sizeBytes > maxBytes) {
      throw const ApiException(
        code: ApiErrorCodes.fileTooLarge,
        message: 'File too large.',
      );
    }
    final task = UploadTask(
      localId: 'u${_seq++}',
      slot: slot,
      document: document,
      phase: UploadPhase.uploading,
    );
    _emit(s.copyWith(uploads: [...s.uploads, task], missing: const []));
    _run(task);
  }

  /// docs/03 §9 `files.max_size_mb` default (the API enforces the live one).
  static const _maxBytes = 10 * 1024 * 1024;

  void retry(String localId) {
    final task = _task(localId);
    if (task == null || task.isActive) return;
    if (task.phase == UploadPhase.infected) return;
    final restarted = task.copyWith(
      phase: task.fileId == null ? UploadPhase.uploading : UploadPhase.scanning,
      progress: task.fileId == null ? 0 : 1,
    );
    _replace(restarted);
    _run(restarted);
  }

  /// Cancels an in-flight upload or dismisses a failed/infected one.
  void cancel(String localId) {
    _cancellations.remove(localId)?.cancel();
    _drop(localId);
  }

  /// Null when the wizard has no loaded request (nothing was sent).
  Future<VerificationRequest?> submit(String comment) async {
    final s = _s;
    if (s == null) return null;
    try {
      final r = await _repo.submit(s.request.id, comment: comment);
      _setRequest(r);
      return r;
    } on ApiException catch (e) {
      if (e.code == ApiErrorCodes.verificationIncomplete) {
        final raw = e.details?['missing'];
        final items = raw is List
            ? raw.whereType<String>().map(MissingItem.parse).nonNulls.toList()
            : const <MissingItem>[];
        final latest = _s;
        if (latest != null) _emit(latest.copyWith(missing: items));
      }
      rethrow;
    }
  }

  Future<void> _run(UploadTask initial) async {
    final id = initial.localId;
    final cancellation = UploadCancellation();
    _cancellations[id] = cancellation;
    final polling = ref.read(scanPollingProvider);
    try {
      var fileId = initial.fileId;
      fileId ??= await _files.presignAndUpload(
        initial.document,
        selfie: initial.slot.kind == DocKind.selfie,
        cancellation: cancellation,
        onProgress: (p) {
          final t = _task(id);
          if (t != null && !cancellation.isCancelled) {
            _replace(t.copyWith(progress: p));
          }
        },
      );
      if (cancellation.isCancelled) return;
      _patch(
          id,
          (t) => t.copyWith(
              phase: UploadPhase.scanning, progress: 1, fileId: fileId));
      var scan = await _files.confirm(fileId);
      var polls = 0;
      while (scan == ScanState.pending) {
        if (cancellation.isCancelled) return;
        if (polls++ >= polling.maxPolls) throw const ScanTimeoutException();
        await Future<void>.delayed(polling.interval);
        if (cancellation.isCancelled || !ref.mounted) return;
        scan = await _files.scanStatus(fileId);
      }
      if (cancellation.isCancelled) return;
      if (scan != ScanState.clean) {
        _patch(id, (t) => t.copyWith(phase: UploadPhase.infected));
        return;
      }
      _patch(id, (t) => t.copyWith(phase: UploadPhase.attaching));
      final s = _s;
      if (s == null) return;
      final r =
          await _repo.attach(s.request.id, fileId: fileId, slot: initial.slot);
      if (cancellation.isCancelled) return;
      _setRequest(r, dropTask: id);
    } on UploadCancelledException {
      _drop(id);
    } on Object catch (error) {
      if (!cancellation.isCancelled) {
        _patch(id, (t) => t.copyWith(phase: UploadPhase.failed, error: error));
      }
    } finally {
      if (identical(_cancellations[id], cancellation))
        _cancellations.remove(id);
    }
  }

  UploadTask? _task(String id) {
    for (final t in _s?.uploads ?? const <UploadTask>[]) {
      if (t.localId == id) return t;
    }
    return null;
  }

  void _patch(String id, UploadTask Function(UploadTask) f) {
    final t = _task(id);
    if (t != null) _replace(f(t));
  }

  void _replace(UploadTask task) {
    final s = _s;
    if (s == null) return;
    _emit(
      s.copyWith(
        uploads: [
          for (final u in s.uploads) u.localId == task.localId ? task : u,
        ],
      ),
    );
  }

  void _drop(String id) {
    final s = _s;
    if (s == null) return;
    _emit(
      s.copyWith(
        uploads: s.uploads.where((u) => u.localId != id).toList(),
      ),
    );
  }

  void _setRequest(VerificationRequest r, {String? dropTask}) {
    final s = _s;
    if (s == null) return;
    _emit(
      s.copyWith(
        request: r,
        uploads: dropTask == null
            ? s.uploads
            : s.uploads.where((u) => u.localId != dropTask).toList(),
        missing: const [],
      ),
    );
  }
}
