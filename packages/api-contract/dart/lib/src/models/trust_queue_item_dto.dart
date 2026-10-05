// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_trust_attorney_dto.dart';
import 'bar_lookup_dto.dart';
import 'registry_link_dto.dart';
import 'trust_holds_dto.dart';
import 'trust_queue_item_dto_badge_status.dart';
import 'trust_queue_item_dto_missing.dart';
import 'trust_queue_item_dto_reasons.dart';
import 'trust_signals_dto.dart';

part 'trust_queue_item_dto.g.dart';

@JsonSerializable()
class TrustQueueItemDto {
  const TrustQueueItemDto({
    required this.attorney,
    required this.level,
    required this.reasons,
    required this.missing,
    required this.signals,
    required this.holds,
    required this.stripeBusinessType,
    required this.stripeRepresentative,
    required this.stripeCompanyName,
    required this.registryLinks,
    required this.lookups,
    required this.blocked,
    required this.requestId,
    required this.documentsCount,
    required this.documentsRequestedAt,
    required this.waitingSince,
    required this.badgeStatus,
  });

  factory TrustQueueItemDto.fromJson(Map<String, Object?> json) =>
      _$TrustQueueItemDtoFromJson(json);

  final AdminTrustAttorneyDto attorney;
  final int level;
  final List<TrustQueueItemDtoReasons> reasons;
  final List<TrustQueueItemDtoMissing> missing;
  final TrustSignalsDto signals;
  final TrustHoldsDto holds;
  final String? stripeBusinessType;
  final String? stripeRepresentative;
  final String? stripeCompanyName;
  final List<RegistryLinkDto> registryLinks;
  final List<BarLookupDto> lookups;

  /// One of the licenses is on the block list.
  final bool blocked;

  /// Open the documents on this verification request.
  final String? requestId;

  /// Documents on that request.
  final int documentsCount;
  final DateTime? documentsRequestedAt;
  final DateTime? waitingSince;
  final TrustQueueItemDtoBadgeStatus badgeStatus;

  Map<String, Object?> toJson() => _$TrustQueueItemDtoToJson(this);
}
