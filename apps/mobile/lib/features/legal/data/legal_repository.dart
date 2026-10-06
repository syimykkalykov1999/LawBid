import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/legal/domain/legal_documents.dart';
import 'package:lawbid/features/legal/domain/legal_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-05 (legal) — `/legal/*`: the owner's legal texts and the
/// DMCA takedown form.
class LegalRepository {
  LegalRepository(Dio dio)
      : _dio = dio,
        _api = api.LegalClient(dio);

  final Dio _dio;
  final api.LegalClient _api;

  /// `GET /legal/settings` — texts in the user's language.
  Future<LegalSettings> settings() async {
    final d = (await guardApiCall(_api.getLegalSettings)).data;
    return LegalSettings(
      dmcaAgent: DmcaAgent(
        name: d.dmcaAgent.name.trim(),
        email: d.dmcaAgent.email.trim(),
        address: d.dmcaAgent.address.trim(),
      ),
      texts: LegalTexts(
        caseCreate: d.texts.caseCreate.trim(),
        attorneyUnverified: d.texts.attorneyUnverified.trim(),
        supportNote: d.texts.supportNote.trim(),
        partnerDisclosure: d.texts.partnerDisclosure.trim(),
        partnerTerms: d.texts.partnerTerms.trim(),
      ),
      partnerTermsVersion: d.partnerTermsVersion,
    );
  }

  /// `POST /legal/dmca` → the notice id.
  Future<String> createDmcaNotice(DmcaNoticeDraft draft) async {
    final r = await guardApiCall(
      () => _api.createDmcaNotice(
        body: api.CreateDmcaNoticeDto(
          targetType: draft.target == null
              ? null
              : api.DmcaTargetType.fromJson(draft.target!.wire),
          targetId: draft.targetId,
          infringingUrl: draft.infringingUrl,
          complainantName: draft.complainantName,
          complainantEmail: draft.complainantEmail,
          complainantAddress: draft.complainantAddress,
          complainantPhone: draft.complainantPhone,
          workDescription: draft.workDescription,
          goodFaith: draft.goodFaith,
          accuracySworn: draft.accuracySworn,
          signature: draft.signature,
        ),
      ),
    );
    return r.data.id;
  }

  // --- Owner 2026-10-05 (legal documents) ---

  /// `GET /legal/documents` — every current document (public).
  Future<List<LegalDocumentBrief>> documents() async {
    final r = await guardApiCall(_api.listCurrentLegalDocuments);
    return [
      for (final d in r.data)
        LegalDocumentBrief(
          docType: d.docType.json ?? '',
          locale: d.locale.json ?? 'en',
          version: d.version,
          title: d.title,
          publishedAt: d.publishedAt,
        ),
    ];
  }

  /// `GET /legal/documents/:type?locale=` — the current text; English when
  /// there is none in [locale]. Plain Dio: the generated client names its
  /// enum path parameter by position, which shifts when the API grows.
  Future<LegalDocumentText> documentText(
    String docType, {
    required String locale,
  }) async {
    final response = await guardApiCall(
      () => _dio.get<Map<String, dynamic>>(
        '/legal/documents/${Uri.encodeComponent(docType)}',
        queryParameters: {'locale': locale},
      ),
    );
    final d = (response.data?['data'] as Map<String, dynamic>?) ?? const {};
    final md = d['contentMd'];
    if (md is! String) {
      throw const ApiException(
        code: ApiException.networkErrorCode,
        message: 'Unexpected response shape from the server.',
      );
    }
    return LegalDocumentText(
      docType: docType,
      locale: d['locale'] as String? ?? locale,
      version: d['version'] as String? ?? '',
      title: d['title'] as String? ?? '',
      contentMd: md,
      publishedAt: DateTime.tryParse(d['publishedAt'] as String? ?? ''),
    );
  }

  /// `POST /legal/accept` — the ticked documents; returns what is still
  /// pending.
  Future<List<PendingLegalDocument>> accept(List<String> documentIds) async {
    final r = await guardApiCall(
      () => _api.acceptLegalDocuments(
        body: api.AcceptLegalDocumentsDto(documentIds: documentIds),
      ),
    );
    return [
      for (final d in r.data)
        PendingLegalDocument(
          id: d.id,
          docType: d.docType.json ?? '',
          version: d.version,
          title: d.title,
          updated: d.reason == api.PendingLegalDocumentDtoReason.updated,
        ),
    ];
  }
}
