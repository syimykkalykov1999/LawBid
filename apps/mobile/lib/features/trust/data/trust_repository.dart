import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/trust/domain/trust_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-05 — `/trust/*` (attorney trust levels).
class TrustRepository {
  TrustRepository(Dio dio) : _api = api.TrustClient(dio);

  final api.TrustClient _api;

  /// What LawBid checked about [attorneyId] (any signed-in user).
  Future<PublicTrust> attorney(String attorneyId) async {
    final d = (await guardApiCall(
      () => _api.getAttorneyTrust(attorneyId: attorneyId),
    ))
        .data;
    return _public(
      attorneyId: d.attorneyId,
      level: d.level,
      badge: d.badge,
      cleared: d.cleared,
      signals: d.signals,
      acceptsPayments: d.acceptsPayments,
      canBid: d.canBid,
      registryLinks: d.registryLinks,
    );
  }

  /// The attorney's own level, gates and next steps.
  Future<OwnTrust> me() async {
    final d = (await guardApiCall(_api.getMyTrust)).data;
    return OwnTrust(
      public: _public(
        attorneyId: d.attorneyId,
        level: d.level,
        badge: d.badge,
        cleared: d.cleared,
        signals: d.signals,
        acceptsPayments: d.acceptsPayments,
        canBid: d.canBid,
        registryLinks: d.registryLinks,
      ),
      bidsGate: _gate(d.bidsGate),
      paymentsGate: _gate(d.paymentsGate),
      requirements: {
        if (d.requirements.registry) TrustRequirement.registry,
        if (d.requirements.identity) TrustRequirement.identity,
        if (d.requirements.documents) TrustRequirement.documents,
      },
      missing: _requirements(d.missing.map((m) => m.json)),
      staffStatus: switch (d.staffStatus) {
        api.OwnTrustDtoStaffStatus.needsStaff => TrustStaffStatus.needsStaff,
        api.OwnTrustDtoStaffStatus.cleared => TrustStaffStatus.cleared,
        api.OwnTrustDtoStaffStatus.suspended => TrustStaffStatus.suspended,
        _ => TrustStaffStatus.selfDeclared,
      },
      documentsRequested: d.documentsRequested?.json,
      payoutDelayDays: d.payoutDelayDays,
      nextSteps: d.nextSteps,
      firmLink: FirmLink(
        status: switch (d.firmLink.status) {
          api.FirmLinkDtoStatus.pending => FirmLinkStatus.pending,
          api.FirmLinkDtoStatus.confirmed => FirmLinkStatus.confirmed,
          _ => FirmLinkStatus.none,
        },
        source: switch (d.firmLink.source) {
          api.FirmLinkDtoSource.registry => FirmLinkSource.registry,
          api.FirmLinkDtoSource.email => FirmLinkSource.email,
          api.FirmLinkDtoSource.staff => FirmLinkSource.staff,
          _ => null,
        },
        at: d.firmLink.at?.toLocal(),
        emailDomain: d.firmLink.emailDomain,
      ),
      stripeBusinessType: d.stripeBusinessType,
    );
  }

  /// Sends a 6-digit code to the attorney's address at the firm; returns
  /// the domain the server will link.
  Future<String> requestFirmEmailCode(String email) async {
    final d = (await guardApiCall(
      () => _api.requestFirmEmailCode(
        body: api.FirmEmailRequestDto(email: email.trim()),
      ),
    ))
        .data;
    return d.domain;
  }

  /// Confirms the code; returns the linked domain.
  Future<String> confirmFirmEmailCode(String code) async {
    final d = (await guardApiCall(
      () => _api.confirmFirmEmailCode(
        body: api.FirmEmailConfirmDto(code: code.trim()),
      ),
    ))
        .data;
    return d.domain;
  }

  static PublicTrust _public({
    required String attorneyId,
    required int level,
    required bool badge,
    required bool cleared,
    required api.TrustSignalsDto signals,
    required bool acceptsPayments,
    required bool canBid,
    required List<api.RegistryLinkDto> registryLinks,
  }) =>
      PublicTrust(
        attorneyId: attorneyId,
        level: TrustLevels.clamp(level),
        badge: badge,
        cleared: cleared,
        signals: TrustSignals(
          selfAttested: signals.selfAttested,
          licenseConfirmed: signals.licenseConfirmed,
          licenseConfirmedBy: switch (signals.licenseConfirmedBy) {
            api.TrustSignalsDtoLicenseConfirmedBy.registry =>
              LicenseConfirmedBy.registry,
            api.TrustSignalsDtoLicenseConfirmedBy.staff =>
              LicenseConfirmedBy.staff,
            _ => null,
          },
          documentsVerified: signals.documentsVerified,
          stripeKyc: signals.stripeKyc,
          stripeIdentity: signals.stripeIdentity,
          identityConfirmed: signals.identityConfirmed,
          nameCheck: switch (signals.nameCheck) {
            api.TrustSignalsDtoNameCheck.match => NameCheck.match,
            api.TrustSignalsDtoNameCheck.mismatch => NameCheck.mismatch,
            _ => NameCheck.unknown,
          },
          firmLinkConfirmed: signals.firmLinkConfirmed,
        ),
        acceptsPayments: acceptsPayments,
        canBid: canBid,
        registryLinks: [
          for (final l in registryLinks)
            RegistryLink(
              stateCode: l.stateCode,
              stateName: l.stateName,
              url: l.url,
            ),
        ],
      );

  static TrustGate _gate(api.TrustGateDto g) => TrustGate(
        ok: g.ok,
        reason: switch (g.reason) {
          api.TrustGateDtoReason.requirements => TrustGateReason.requirements,
          api.TrustGateDtoReason.hold => TrustGateReason.hold,
          api.TrustGateDtoReason.suspended => TrustGateReason.suspended,
          _ => null,
        },
        missing: _requirements(g.missing.map((m) => m.json)),
        currentLevel: g.current,
        hold: g.hold,
      );

  /// Unknown names (a newer server) are dropped.
  static List<TrustRequirement> _requirements(Iterable<String?> wires) => [
        for (final w in wires)
          if (TrustRequirement.parse(w) case final r?) r,
      ];
}
