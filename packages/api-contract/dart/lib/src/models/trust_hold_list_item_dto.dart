// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_trust_attorney_dto.dart';
import 'trust_holds_dto.dart';

part 'trust_hold_list_item_dto.g.dart';

@JsonSerializable()
class TrustHoldListItemDto {
  const TrustHoldListItemDto({
    required this.attorney,
    required this.level,
    required this.holds,
    required this.complaintsTotal,
    required this.heldSince,
  });

  factory TrustHoldListItemDto.fromJson(Map<String, Object?> json) =>
      _$TrustHoldListItemDtoFromJson(json);

  final AdminTrustAttorneyDto attorney;
  final int level;
  final TrustHoldsDto holds;
  final int complaintsTotal;

  /// Oldest hold.
  final DateTime heldSince;

  Map<String, Object?> toJson() => _$TrustHoldListItemDtoToJson(this);
}
