import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/features/cases/data/cases_mappers.dart';
import 'package:lawbid/features/cases/domain/case_invite.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-05: client → attorney case invites.
abstract interface class InvitesRepository {
  /// The client offers [caseId] to [attorneyId].
  Future<CaseInvite> send(
    String caseId, {
    required String attorneyId,
    String? message,
    int? budgetCents,
  });

  /// Every invite on the client's case (an attorney gets only their own).
  Future<List<CaseInvite>> forCase(String caseId);

  /// The attorney's invites waiting for an answer, newest first.
  Future<List<CaseInvite>> pending();

  Future<CaseInvite> decline(String id, {String? reason});

  Future<CaseInvite> cancel(String id);
}

class ApiInvitesRepository implements InvitesRepository {
  ApiInvitesRepository(Dio dio) : _api = api.InvitesClient(dio);

  final api.InvitesClient _api;

  static const Map<String, dynamic> _createsResource = {
    RequestFlags.createsResource: true,
  };

  @override
  Future<CaseInvite> send(
    String caseId, {
    required String attorneyId,
    String? message,
    int? budgetCents,
  }) async =>
      _invite(
        (await guardApiCall(
          () => _api.createInvite(
            id: caseId,
            body: api.CreateInviteDto(
              attorneyId: attorneyId,
              message: message,
              budgetCents: budgetCents,
            ),
            extras: _createsResource,
          ),
        ))
            .data,
      );

  @override
  Future<List<CaseInvite>> forCase(String caseId) async =>
      (await guardApiCall(() => _api.listCaseInvites(id: caseId)))
          .data
          .map(_invite)
          .toList();

  @override
  Future<List<CaseInvite>> pending() async => (await guardApiCall(
        () => _api.listMyInvites(status: api.InviteListStatus.pending),
      ))
          .data
          .map(_invite)
          .toList();

  @override
  Future<CaseInvite> decline(String id, {String? reason}) async => _invite(
        (await guardApiCall(
          () => _api.declineInvite(
            id: id,
            body: api.DeclineInviteDto(reason: reason),
          ),
        ))
            .data,
      );

  @override
  Future<CaseInvite> cancel(String id) async =>
      _invite((await guardApiCall(() => _api.cancelInvite(id: id))).data);

  static CaseInvite _invite(api.CaseInviteDto d) => CaseInvite(
        id: d.id,
        caseId: d.caseId,
        attorneyId: d.attorneyId,
        status: InviteStatus.fromJson(d.status.json),
        message: d.message,
        budgetCents: d.budgetCents,
        declineReason: d.declineReason,
        outsidePractice: d.outsidePractice,
        outsideLicensedStates: d.outsideLicensedStates,
        bidId: d.bidId,
        expiresAt: d.expiresAt,
        createdAt: d.createdAt,
        caseTitle: d.caseTitle,
        casePracticeKey: d.casePracticeKey,
        caseStateCodes: d.caseStateCodes,
        attorney:
            d.attorney == null ? null : CasesMappers.attorney(d.attorney!),
        caseCity: d.caseCity,
        caseUrgency:
            d.caseUrgency == api.CaseUrgency.$unknown ? null : d.caseUrgency,
        caseUrgencyDetail: CaseUrgencyInfo.of(
          urgency: d.caseUrgency,
          level: d.caseUrgencyLevel,
          deadlineAt: d.caseDeadlineAt,
          kind: d.caseDeadlineKind,
        ),
        caseBudget: CaseBudget(
          mode: d.caseBudget.mode,
          amountCents: d.caseBudget.amountCents,
        ),
        caseDossier: CasesMappers.dossier(d.caseDossier),
      );
}
