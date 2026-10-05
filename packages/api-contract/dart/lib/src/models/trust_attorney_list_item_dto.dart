// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_trust_attorney_dto.dart';
import 'bar_lookup_dto.dart';
import 'staff_admin_dto.dart';
import 'trust_attorney_list_item_dto_badge_status.dart';
import 'trust_attorney_list_item_dto_missing.dart';
import 'trust_attorney_list_item_dto_reasons.dart';
import 'trust_holds_dto.dart';

part 'trust_attorney_list_item_dto.g.dart';

@JsonSerializable()
class TrustAttorneyListItemDto {
  const TrustAttorneyListItemDto({
    required this.attorney,
    required this.level,
    required this.badgeStatus,
    required this.badge,
    required this.missing,
    required this.reasons,
    required this.holds,
    required this.staffClearedAt,
    required this.staffClearedBy,
    required this.documentsRequestedAt,
    required this.complaintsTotal,
    required this.lookups,
    required this.blocked,
  });

  factory TrustAttorneyListItemDto.fromJson(Map<String, Object?> json) =>
      _$TrustAttorneyListItemDtoFromJson(json);

  final AdminTrustAttorneyDto attorney;
  final int level;
  final TrustAttorneyListItemDtoBadgeStatus badgeStatus;

  /// Blue check shown in the app right now.
  final bool badge;
  final List<TrustAttorneyListItemDtoMissing> missing;
  final List<TrustAttorneyListItemDtoReasons> reasons;
  final TrustHoldsDto holds;
  final DateTime? staffClearedAt;
  final StaffAdminDto? staffClearedBy;
  final DateTime? documentsRequestedAt;
  final int complaintsTotal;
  final List<BarLookupDto> lookups;

  /// One of the licenses is on the block list.
  final bool blocked;

  Map<String, Object?> toJson() => _$TrustAttorneyListItemDtoToJson(this);
}
