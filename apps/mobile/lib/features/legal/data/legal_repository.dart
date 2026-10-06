import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/legal/domain/legal_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-05 (legal) — `/legal/*`: the owner's legal texts and the
/// DMCA takedown form.
class LegalRepository {
  LegalRepository(Dio dio) : _api = api.LegalClient(dio);

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
}
