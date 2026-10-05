// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_trust_attorney_dto.dart';
import 'admin_trust_card_dto_badge_status.dart';
import 'admin_trust_card_dto_cleared_by.dart';
import 'admin_trust_card_dto_missing.dart';
import 'admin_trust_card_dto_queue_reasons.dart';
import 'admin_trust_card_dto_staff_status.dart';
import 'bar_lookup_dto.dart';
import 'firm_link_dto.dart';
import 'registry_link_dto.dart';
import 'staff_admin_dto.dart';
import 'trust_event_dto.dart';
import 'trust_gate_dto.dart';
import 'trust_holds_dto.dart';
import 'trust_requirements_dto.dart';
import 'trust_signals_dto.dart';

part 'admin_trust_card_dto.g.dart';

@JsonSerializable()
class AdminTrustCardDto {
  const AdminTrustCardDto({
    required this.attorney,
    required this.level,
    required this.badgeStatus,
    required this.badge,
    required this.signals,
    required this.holds,
    required this.bidsGate,
    required this.paymentsGate,
    required this.cleared,
    required this.clearedBy,
    required this.staffClearedAt,
    required this.staffClearedBy,
    required this.staffStatus,
    required this.queueReasons,
    required this.missing,
    required this.requirements,
    required this.documentsRequestedAt,
    required this.documentsRequestedTemplate,
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
    required this.lookups,
    required this.blocked,
    required this.latestRequestId,
    required this.events,
  });

  factory AdminTrustCardDto.fromJson(Map<String, Object?> json) =>
      _$AdminTrustCardDtoFromJson(json);

  final AdminTrustAttorneyDto attorney;
  final int level;

  /// The badge as the admin manages it (owner 2026-10-05).
  final AdminTrustCardDtoBadgeStatus badgeStatus;
  final bool badge;
  final TrustSignalsDto signals;
  final TrustHoldsDto holds;
  final TrustGateDto bidsGate;
  final TrustGateDto paymentsGate;
  final bool cleared;
  final AdminTrustCardDtoClearedBy? clearedBy;
  final DateTime? staffClearedAt;

  /// Who pressed «Подтвердить» (stays after a suspension).
  final StaffAdminDto? staffClearedBy;
  final AdminTrustCardDtoStaffStatus staffStatus;
  final List<AdminTrustCardDtoQueueReasons> queueReasons;
  final List<AdminTrustCardDtoMissing> missing;
  final TrustRequirementsDto requirements;
  final DateTime? documentsRequestedAt;
  final String? documentsRequestedTemplate;
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
  final List<BarLookupDto> lookups;

  /// One of the licenses is on the block list (owner 07:00).
  final bool blocked;

  /// Latest verification request (its card).
  final String? latestRequestId;
  final List<TrustEventDto> events;

  Map<String, Object?> toJson() => _$AdminTrustCardDtoToJson(this);
}
