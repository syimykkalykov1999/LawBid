// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'journal_item_dto_appeal_status.dart';
import 'journal_item_dto_target_type.dart';

part 'journal_item_dto.g.dart';

@JsonSerializable()
class JournalItemDto {
  const JournalItemDto({
    required this.id,
    required this.action,
    required this.targetType,
    required this.targetId,
    required this.reason,
    required this.adminId,
    required this.adminName,
    required this.appealStatus,
    required this.createdAt,
  });

  factory JournalItemDto.fromJson(Map<String, Object?> json) =>
      _$JournalItemDtoFromJson(json);

  final String id;
  final String action;
  final JournalItemDtoTargetType targetType;
  final String targetId;
  final String? reason;
  final String adminId;
  final String? adminName;
  final JournalItemDtoAppealStatus? appealStatus;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$JournalItemDtoToJson(this);
}
