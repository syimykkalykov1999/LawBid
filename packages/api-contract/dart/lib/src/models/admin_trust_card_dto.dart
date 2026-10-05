// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_trust_attorney_dto.dart';
import 'firm_link_dto.dart';
import 'registry_link_dto.dart';
import 'trust_event_dto.dart';
import 'trust_gate_dto.dart';
import 'trust_holds_dto.dart';
import 'trust_signals_dto.dart';

part 'admin_trust_card_dto.g.dart';

@JsonSerializable()
class AdminTrustCardDto {
  const AdminTrustCardDto({
    required this.attorney,
    required this.level,
    required this.badge,
    required this.signals,
    required this.holds,
    required this.bidsGate,
    required this.paymentsGate,
    required this.stripeLegalName,
    required this.stripeBusinessType,
    required this.stripeCompanyName,
    required this.stripeCompanyDomain,
    required this.stripeRepresentative,
    required this.firmLink,
    required this.firmLinkNote,
    required this.payoutDelayDays,
    required this.complaintsTotal,
    required this.duplicateClaims,
    required this.registryLinks,
    required this.latestRequestId,
    required this.events,
  });

  factory AdminTrustCardDto.fromJson(Map<String, Object?> json) =>
      _$AdminTrustCardDtoFromJson(json);

  final AdminTrustAttorneyDto attorney;
  final int level;
  final bool badge;
  final TrustSignalsDto signals;
  final TrustHoldsDto holds;
  final TrustGateDto bidsGate;
  final TrustGateDto paymentsGate;
  final String? stripeLegalName;

  /// individual | company | …
  final String? stripeBusinessType;
  final String? stripeCompanyName;
  final String? stripeCompanyDomain;

  /// Representative / owner compared with the profile.
  final String? stripeRepresentative;
  final FirmLinkDto firmLink;
  final String? firmLinkNote;
  final int? payoutDelayDays;
  final int complaintsTotal;
  final int duplicateClaims;
  final List<RegistryLinkDto> registryLinks;

  /// Latest verification request (its card).
  final String? latestRequestId;
  final List<TrustEventDto> events;

  Map<String, Object?> toJson() => _$AdminTrustCardDtoToJson(this);
}
