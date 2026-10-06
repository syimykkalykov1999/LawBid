import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/partners/domain/partner_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-05 — `/partners/me`.
class PartnersRepository {
  PartnersRepository(Dio dio) : _api = api.PartnersClient(dio);

  final api.PartnersClient _api;

  Future<PartnerMe> me() async =>
      _map((await guardApiCall(_api.getMyPartnerDashboard)).data);

  /// Owner 2026-10-05: attorneys and clients take their link themselves.
  /// Owner 2026-10-05 (legal): only after accepting the partner rules —
  /// the server refuses `termsAccepted: false`.
  Future<PartnerMe> join({required bool termsAccepted}) async => _map(
        (await guardApiCall(
          () => _api.joinPartnerProgram(
            body: api.JoinPartnerDto(termsAccepted: termsAccepted),
          ),
        ))
            .data,
      );

  /// Owner 2026-10-05 (legal): an existing partner accepts the current
  /// rules (`termsAcceptedVersion` was null).
  Future<PartnerMe> acceptTerms() async =>
      _map((await guardApiCall(_api.acceptPartnerTerms)).data);

  PartnerMe _map(api.PartnerMeDto d) {
    return PartnerMe(
      enabled: d.enabled,
      isPartner: d.isPartner,
      canJoin: d.canJoin,
      joinMode: d.joinMode.json ?? 'open',
      status: d.status?.json,
      code: d.code,
      shareUrl: d.shareUrl,
      rates: PartnerRates(
        attorneyRateCents: d.rates.attorneyRateCents,
        clientRateCents: d.rates.clientRateCents,
        monthlyBaseCents: d.rates.monthlyBaseCents,
        clientRule: d.rates.clientRule.json ?? 'bid_accepted',
        holdDays: d.rates.holdDays,
      ),
      totals: PartnerTotals(
        heldCents: d.totals.heldCents,
        approvedCents: d.totals.approvedCents,
        paidCents: d.totals.paidCents,
        thisMonthCents: d.totals.thisMonthCents,
        referredCount: d.totals.referredCount,
        qualifiedCount: d.totals.qualifiedCount,
      ),
      referred: [
        for (final r in d.referred)
          ReferredUser(
            id: r.id,
            name: r.name,
            isAttorney: r.role == api.PartnerReferredUserDtoRole.attorney,
            status: r.status.json ?? 'joined',
            amountCents: r.amountCents,
            joinedAt: r.joinedAt,
            qualifiedAt: r.qualifiedAt,
          ),
      ],
      commissions: [
        for (final c in d.commissions)
          PartnerCommission(
            id: c.id,
            kind: CommissionKind.parse(c.kind.json),
            amountCents: c.amountCents,
            status: c.status.json ?? 'held',
            period: c.period,
            createdAt: c.createdAt,
            holdUntil: c.holdUntil,
            paidAt: c.paidAt,
            note: c.note,
          ),
      ],
      title: d.texts.title.trim(),
      summary: d.texts.summary.trim(),
      disclosure: d.texts.disclosure.trim(),
      terms: d.texts.terms.trim(),
      termsVersion: d.termsVersion,
      termsAcceptedVersion: d.termsAcceptedVersion,
      w9Required: d.w9Required,
      w9Received: d.w9Received,
    );
  }
}
