// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'appeal_item_dto_action.dart';
import 'appeal_item_dto_status.dart';
import 'appeal_item_dto_target_type.dart';

part 'appeal_item_dto.g.dart';

@JsonSerializable()
class AppealItemDto {
  const AppealItemDto({
    required this.id,
    required this.status,
    required this.targetType,
    required this.targetId,
    required this.action,
    required this.actionReason,
    required this.message,
    required this.excerpt,
    required this.targetStatus,
    required this.appellantId,
    required this.appellantName,
    required this.createdAt,
    required this.decidedAt,
    required this.decisionNote,
  });

  factory AppealItemDto.fromJson(Map<String, Object?> json) =>
      _$AppealItemDtoFromJson(json);

  final String id;
  final AppealItemDtoStatus status;
  final AppealItemDtoTargetType targetType;
  final String targetId;
  final AppealItemDtoAction action;
  final String? actionReason;
  final String message;
  final String? excerpt;
  final String? targetStatus;
  final String appellantId;
  final String? appellantName;
  final DateTime createdAt;
  final DateTime? decidedAt;
  final String? decisionNote;

  Map<String, Object?> toJson() => _$AppealItemDtoToJson(this);
}
