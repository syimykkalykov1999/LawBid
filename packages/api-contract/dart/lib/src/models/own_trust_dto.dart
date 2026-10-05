// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'firm_link_dto.dart';
import 'own_trust_dto_documents_requested.dart';
import 'own_trust_dto_missing.dart';
import 'own_trust_dto_staff_status.dart';
import 'registry_link_dto.dart';
import 'trust_gate_dto.dart';
import 'trust_requirements_dto.dart';
import 'trust_signals_dto.dart';

part 'own_trust_dto.g.dart';

@JsonSerializable()
class OwnTrustDto {
  const OwnTrustDto({
    required this.attorneyId,
    required this.level,
    required this.badge,
    required this.cleared,
    required this.signals,
    required this.acceptsPayments,
    required this.canBid,
    required this.registryLinks,
    required this.bidsGate,
    required this.paymentsGate,
    required this.requirements,
    required this.missing,
    required this.staffStatus,
    required this.documentsRequested,
    required this.payoutDelayDays,
    required this.nextSteps,
    required this.firmLink,
    required this.stripeBusinessType,
  });

  factory OwnTrustDto.fromJson(Map<String, Object?> json) =>
      _$OwnTrustDtoFromJson(json);

  final String attorneyId;
  final int level;

  /// The blue check is shown.
  final bool badge;

  /// Every requirement the owner switched on is met (or staff confirmed): the badge and payments are open.
  final bool cleared;
  final TrustSignalsDto signals;

  /// Client money can be sent through LawBid to this attorney.
  final bool acceptsPayments;

  /// Bids and chat are open.
  final bool canBid;

  /// One per licensed state.
  final List<RegistryLinkDto> registryLinks;
  final TrustGateDto bidsGate;
  final TrustGateDto paymentsGate;
  final TrustRequirementsDto requirements;

  /// Requirements still missing for the badge and payments.
  final List<OwnTrustDtoMissing> missing;
  final OwnTrustDtoStaffStatus staffStatus;

  /// Staff asked for more documents (template).
  final OwnTrustDtoDocumentsRequested? documentsRequested;

  /// Stripe payout delay LawBid applies at this level, days.
  final int? payoutDelayDays;

  /// What raises the level next: hold_review | registry_check | stripe_kyc | fix_name | firm_link | documents.
  final List<String> nextSteps;
  final FirmLinkDto firmLink;

  /// Stripe business type when known.
  final String? stripeBusinessType;

  Map<String, Object?> toJson() => _$OwnTrustDtoToJson(this);
}
