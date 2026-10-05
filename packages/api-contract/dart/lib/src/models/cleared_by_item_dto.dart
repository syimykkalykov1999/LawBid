// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_trust_attorney_dto.dart';

part 'cleared_by_item_dto.g.dart';

@JsonSerializable()
class ClearedByItemDto {
  const ClearedByItemDto({
    required this.attorney,
    required this.level,
    required this.clearedAt,
    required this.complaintsAfter,
    required this.suspendedAfter,
    required this.documentsSeen,
  });

  factory ClearedByItemDto.fromJson(Map<String, Object?> json) =>
      _$ClearedByItemDtoFromJson(json);

  final AdminTrustAttorneyDto attorney;
  final int level;
  final DateTime clearedAt;
  final int complaintsAfter;
  final bool suspendedAfter;

  /// Document types on the request they saw.
  final List<String> documentsSeen;

  Map<String, Object?> toJson() => _$ClearedByItemDtoToJson(this);
}
