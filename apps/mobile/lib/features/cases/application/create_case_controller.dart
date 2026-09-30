import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/domain/case_draft.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/social/application/social_providers.dart';

/// Number of wizard steps (docs/04 §3.1).
const int kCaseWizardSteps = 5;

@immutable

/// OQ-031: a photo picked in the wizard, uploaded right away.
@immutable
class CasePhotoUpload {
  const CasePhotoUpload({
    required this.key,
    required this.bytes,
    this.fileId,
    this.failed = false,
    this.name,
  });

  final int key;
  final Uint8List bytes;

  /// OQ-034: set for a document (PDF / Word) — shown as a file tile.
  final String? name;
  bool get isDocument => name != null;

  /// Set once the upload passed the antivirus scan.
  final String? fileId;
  final bool failed;

  bool get uploading => fileId == null && !failed;
}

/// OQ-031: photos per case.
const kCaseMaxPhotos = 9;

class CreateCaseState {
  const CreateCaseState({
    required this.draft,
    this.loaded = false,
    this.restoredDraft = false,
    this.consentChecked = false,
    this.needsConsent = true,
    this.isSubmitting = false,
    this.error,
    this.publishedCaseId,
    this.photos = const [],
  });

  /// OQ-031: 0–9 photos (seen by the owner and the accepted attorney).
  final List<CasePhotoUpload> photos;

  bool get photosUploading => photos.any((p) => p.uploading);

  final CaseDraft draft;
  final bool loaded;

  /// The wizard opened on a saved local draft (a banner offers to start
  /// over).
  final bool restoredDraft;
  final bool consentChecked;

  /// §3.1 step 5: the `client_contact_sharing` checkbox for the first
  /// case. Hidden once this account granted it on this device.
  final bool needsConsent;
  final bool isSubmitting;
  final ApiException? error;
  final String? publishedCaseId;

  bool get stepValid => switch (draft.step) {
        0 => draft.practiceValid,
        1 => draft.titleValid && draft.descriptionValid && !photosUploading,
        2 => draft.placeValid,
        3 => draft.budgetValid,
        _ => !needsConsent || consentChecked,
      };

  CreateCaseState copyWith({
    CaseDraft? draft,
    bool? loaded,
    bool? restoredDraft,
    bool? consentChecked,
    bool? needsConsent,
    bool? isSubmitting,
    ApiException? error,
    bool clearError = false,
    String? publishedCaseId,
    List<CasePhotoUpload>? photos,
  }) =>
      CreateCaseState(
        photos: photos ?? this.photos,
        draft: draft ?? this.draft,
        loaded: loaded ?? this.loaded,
        restoredDraft: restoredDraft ?? this.restoredDraft,
        consentChecked: consentChecked ?? this.consentChecked,
        needsConsent: needsConsent ?? this.needsConsent,
        isSubmitting: isSubmitting ?? this.isSubmitting,
        error: clearError ? null : (error ?? this.error),
        publishedCaseId: publishedCaseId ?? this.publishedCaseId,
      );
}

/// docs/04 §3.1 case wizard: practice → essence → place → budget →
/// review & publish. The draft lives only locally (drift) until
/// published; every edit is saved, debounced, so closing the app keeps it.
class CreateCaseController extends Notifier<CreateCaseState> {
  Timer? _saveDebounce;

  static const _saveDelay = Duration(milliseconds: 400);

  String get _ownerId =>
      ref.read(currentUserControllerProvider).user?.id ?? 'anonymous';

  String get _consentKey => 'cases.contactSharingConsent.$_ownerId';

  @override
  CreateCaseState build() {
    ref.onDispose(() => _saveDebounce?.cancel());
    final user = ref.read(currentUserControllerProvider).user;
    final consentGiven =
        ref.read(localKvStoreProvider).getString(_consentKey) == '1';
    Future.microtask(_restore);
    return CreateCaseState(
      draft: CaseDraft(primaryStateCode: user?.clientProfile?.stateCode),
      needsConsent: !consentGiven,
    );
  }

  Future<void> _restore() async {
    final raw = await ref.read(casesLocalDatabaseProvider).draftJson(_ownerId);
    final saved = CaseDraft.decode(raw);
    if (!ref.mounted) return;
    state = saved == null || saved.isEmpty
        ? state.copyWith(loaded: true)
        : state.copyWith(draft: saved, loaded: true, restoredDraft: true);
  }

  void update(CaseDraft Function(CaseDraft d) change) {
    state = state.copyWith(draft: change(state.draft), clearError: true);
    _scheduleSave();
  }

  int _photoKey = 0;

  /// OQ-031: add picked photos (up to [kCaseMaxPhotos]) and upload each.
  void addPhotos(List<Uint8List> picked) => addFiles([
        for (final b in picked) (bytes: b, name: null),
      ]);

  /// OQ-034: photos and documents share the 9 slots.
  void addFiles(List<({Uint8List bytes, String? name})> picked) {
    final left = kCaseMaxPhotos - state.photos.length;
    for (final f in picked.take(left)) {
      final item =
          CasePhotoUpload(key: _photoKey++, bytes: f.bytes, name: f.name);
      state = state.copyWith(photos: [...state.photos, item]);
      unawaited(_upload(item));
    }
  }

  Future<void> _upload(CasePhotoUpload item) async {
    CasePhotoUpload done;
    try {
      final id = await ref
          .read(socialActionsProvider)
          .uploadPhoto(item.bytes, casePhoto: true);
      done = CasePhotoUpload(
          key: item.key, bytes: item.bytes, fileId: id, name: item.name);
    } on Object {
      done = CasePhotoUpload(
          key: item.key, bytes: item.bytes, failed: true, name: item.name);
    }
    if (!ref.mounted) return;
    state = state.copyWith(photos: [
      for (final p in state.photos) p.key == item.key ? done : p,
    ]);
  }

  void removePhoto(int key) => state = state.copyWith(
        photos: [
          for (final p in state.photos)
            if (p.key != key) p
        ],
      );

  void retryPhoto(int key) {
    final p = state.photos.where((x) => x.key == key).firstOrNull;
    if (p == null || !p.failed) return;
    final again = CasePhotoUpload(key: p.key, bytes: p.bytes, name: p.name);
    state = state.copyWith(photos: [
      for (final x in state.photos) x.key == key ? again : x,
    ]);
    unawaited(_upload(again));
  }

  void setConsent({required bool value}) =>
      state = state.copyWith(consentChecked: value, clearError: true);

  void next() {
    if (!state.stepValid || state.draft.step >= kCaseWizardSteps - 1) return;
    update((d) => d.copyWith(step: d.step + 1));
  }

  void back() {
    if (state.draft.step == 0) return;
    update((d) => d.copyWith(step: d.step - 1));
  }

  void goTo(int step) => update((d) => d.copyWith(step: step));

  /// "Начать заново": drops the restored draft.
  Future<void> startOver() async {
    await ref.read(casesLocalDatabaseProvider).deleteDraft(_ownerId);
    final user = ref.read(currentUserControllerProvider).user;
    state = state.copyWith(
      draft: CaseDraft(primaryStateCode: user?.clientProfile?.stateCode),
      restoredDraft: false,
      clearError: true,
    );
  }

  /// Closing the wizard: keep (true) or discard (false) the draft.
  Future<void> finishEditing({required bool keepDraft}) async {
    _saveDebounce?.cancel();
    final db = ref.read(casesLocalDatabaseProvider);
    if (keepDraft && !state.draft.isEmpty) {
      await db.saveDraft(_ownerId, state.draft.encode());
    } else {
      await db.deleteDraft(_ownerId);
    }
  }

  /// §3.4 publish (`POST /cases`, Idempotency-Key via the repository).
  Future<bool> publish() async {
    if (state.isSubmitting || !state.stepValid) return false;
    state = state.copyWith(isSubmitting: true, clearError: true);
    try {
      final id = await ref.read(casesRepositoryProvider).createCase(
        state.draft,
        contactSharingConsent: state.needsConsent && state.consentChecked,
        photoFileIds: [
          for (final p in state.photos)
            if (p.fileId != null) p.fileId!,
        ],
      );
      await ref.read(localKvStoreProvider).setString(_consentKey, '1');
      await ref.read(casesLocalDatabaseProvider).deleteDraft(_ownerId);
      ref.invalidate(myCasesProvider);
      state = state.copyWith(isSubmitting: false, publishedCaseId: id);
      return true;
    } on ApiException catch (e) {
      // A reinstall forgets the local flag; the server is the truth.
      final consentMissing =
          e.code == ApiErrorCodes.clientContactSharingConsentRequired;
      state = state.copyWith(
        isSubmitting: false,
        error: e,
        needsConsent: consentMissing ? true : null,
        consentChecked: consentMissing ? false : null,
        // Contact info in the text → back to the step that holds it.
        draft: e.code == ApiErrorCodes.caseContainsContactInfo
            ? state.draft.copyWith(step: 1)
            : null,
      );
      return false;
    }
  }

  void _scheduleSave() {
    _saveDebounce?.cancel();
    _saveDebounce = Timer(_saveDelay, () {
      final draft = state.draft;
      if (draft.isEmpty) return;
      unawaited(
        ref
            .read(casesLocalDatabaseProvider)
            .saveDraft(_ownerId, draft.encode()),
      );
    });
  }
}

final createCaseControllerProvider =
    NotifierProvider.autoDispose<CreateCaseController, CreateCaseState>(
  CreateCaseController.new,
);

/// The owner's case as a draft for the edit screen (docs/04 §3.5).
CaseDraft draftFromCase(OwnerCase c) => CaseDraft(
      practiceAreaId: c.practice.id,
      practiceI18nKey: c.practice.i18nKey,
      practiceNameEn: c.practice.nameEn,
      title: c.title,
      description: c.description,
      primaryStateCode: c.primaryStateCode,
      additionalStateCodes: c.additionalStateCodes,
      city: c.city ?? '',
      budgetIsAmount: !c.budget.isClarifyLater,
      budgetDollars:
          c.budget.amountCents == null ? null : c.budget.amountCents! ~/ 100,
    );
