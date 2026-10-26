import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/files/upload_limits.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/cases/workspace/workspace_data.dart';
import 'package:lawbid/features/social/application/social_providers.dart'
    show socialRepositoryProvider;
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-20: data of the case tab "Docs" — signature requests and
/// documents built from templates.
Duration? _noRetry(int retryCount, Object error) => null;

final caseSigningClientProvider = Provider<api.CaseSigningClient>(
  (ref) => api.CaseSigningClient(ref.watch(dioProvider)),
);

final caseDocumentsClientProvider = Provider<api.CaseDocumentsClient>(
  (ref) => api.CaseDocumentsClient(ref.watch(dioProvider)),
);

final signRequestsProvider =
    FutureProvider.autoDispose.family<List<api.SignRequestDto>, String>(
  (ref, id) async => (await guardApiCall(
    () => ref.watch(caseSigningClientProvider).listSignRequests(id: id),
  ))
      .data,
  retry: _noRetry,
);

/// One document's verification, looked up on demand.
final signVerifyProvider = FutureProvider.autoDispose
    .family<api.SignVerifyDto, ({String caseId, String requestId})>(
  (ref, key) async => (await guardApiCall(
    () => ref
        .watch(caseSigningClientProvider)
        .verifySignRequest(id: key.caseId, requestId: key.requestId),
  ))
      .data,
  retry: _noRetry,
);

final caseFormTemplatesProvider =
    FutureProvider.autoDispose.family<api.CaseFormTemplatesDto, String>(
  (ref, id) async => (await guardApiCall(
    () => ref.watch(caseDocumentsClientProvider).listFormTemplates(id: id),
  ))
      .data,
  retry: _noRetry,
);

/// What the server says to a refused input (an unreadable PDF, a short
/// name) is shown as it is; every other failure by its code.
String signingErrorText(Translator t, Object error) {
  if (error is ApiException &&
      error.code == ApiErrorCodes.validationError &&
      error.message.trim().isNotEmpty) {
    return error.message;
  }
  return errorText(t, error);
}

/// The default title of a request: the file name without `.pdf`.
String titleFromFileName(String name) {
  final n = name.trim();
  return n.toLowerCase().endsWith('.pdf') ? n.substring(0, n.length - 4) : n;
}

bool isPdfName(String name) => name.toLowerCase().endsWith('.pdf');

/// Mutations of the Docs tab. Each refreshes the lists it changes.
class CaseSigningActions {
  CaseSigningActions(this._ref);

  final Ref _ref;

  api.CaseSigningClient get _c => _ref.read(caseSigningClientProvider);

  void _refresh(String caseId) {
    _ref
      ..invalidate(signRequestsProvider(caseId))
      ..invalidate(caseFilesProvider(caseId))
      ..invalidate(caseWorkspaceProvider(caseId))
      ..invalidate(caseActivityProvider(caseId));
  }

  /// Uploads [bytes] as a case attachment and asks both sides to sign it.
  Future<void> requestFromBytes(
    String caseId, {
    required Uint8List bytes,
    required String fileName,
    required String title,
  }) async {
    final limits = _ref.read(uploadLimitsProvider)[UploadPlace.kase];
    final fileId = await _ref.read(socialRepositoryProvider).uploadPostPhoto(
          bytes,
          casePhoto: true,
          fileName: fileName,
          maxBytes: limits.fileBytes,
        );
    await requestFromFile(caseId, fileId: fileId, title: title);
  }

  /// Asks both sides to sign a file that is already in the case.
  Future<void> requestFromFile(
    String caseId, {
    required String fileId,
    required String title,
  }) async {
    await guardApiCall(
      () => _c.createSignRequest(
        id: caseId,
        body: api.CreateSignRequestDto(fileId: fileId, title: title.trim()),
      ),
    );
    _refresh(caseId);
  }

  Future<void> sign(
    String caseId,
    String requestId, {
    required api.SignDtoMethod method,
    required String name,
    String? imagePngBase64,
  }) async {
    await guardApiCall(
      () => _c.signDocument(
        id: caseId,
        requestId: requestId,
        body: api.SignDto(
          method: method,
          name: name.trim(),
          imagePngBase64: imagePngBase64,
          consent: true,
        ),
      ),
    );
    _refresh(caseId);
  }

  Future<void> decline(
    String caseId,
    String requestId, {
    String? reason,
  }) async {
    final r = reason?.trim();
    await guardApiCall(
      () => _c.declineSignRequest(
        id: caseId,
        requestId: requestId,
        body: api.DeclineSignDto(reason: r == null || r.isEmpty ? null : r),
      ),
    );
    _refresh(caseId);
  }

  Future<void> cancel(String caseId, String requestId) async {
    await guardApiCall(
      () => _c.cancelSignRequest(id: caseId, requestId: requestId),
    );
    _refresh(caseId);
  }

  Future<api.BuiltDocumentDto> build(
    String caseId, {
    required String templateId,
    required String language,
    required Map<String, String> values,
  }) async {
    final built = (await guardApiCall(
      () => _ref.read(caseDocumentsClientProvider).buildDocument(
            id: caseId,
            body: api.BuildDocumentDto(
              templateId: templateId,
              language: language,
              values: values,
            ),
          ),
    ))
        .data;
    _refresh(caseId);
    return built;
  }
}

final caseSigningActionsProvider =
    Provider<CaseSigningActions>(CaseSigningActions.new);
