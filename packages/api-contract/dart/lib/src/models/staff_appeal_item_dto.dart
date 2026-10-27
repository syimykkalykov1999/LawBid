// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_appeal_author_dto.dart';
import 'staff_appeal_item_dto_kind.dart';
import 'staff_appeal_item_dto_owner_decision.dart';
import 'staff_appeal_item_dto_status.dart';
import 'staff_person_ref_dto.dart';

part 'staff_appeal_item_dto.g.dart';

@JsonSerializable()
class StaffAppealItemDto {
  const StaffAppealItemDto({
    required this.id,
    required this.number,
    required this.kind,
    required this.excerpt,
    required this.head,
    required this.author,
    required this.status,
    required this.ownerDecision,
    required this.redFlag,
    required this.createdAt,
    required this.decidedAt,
  });

  factory StaffAppealItemDto.fromJson(Map<String, Object?> json) =>
      _$StaffAppealItemDtoFromJson(json);

  final String id;
  final num number;
  final StaffAppealItemDtoKind kind;

  /// First 280 characters.
  final String excerpt;
  final StaffPersonRefDto head;
  final StaffAppealAuthorDto author;
  final StaffAppealItemDtoStatus status;
  final StaffAppealItemDtoOwnerDecision ownerDecision;

  /// Red mark: the head acted against this author inside the protection window.
  final bool redFlag;
  final DateTime createdAt;
  final DateTime? decidedAt;

  Map<String, Object?> toJson() => _$StaffAppealItemDtoToJson(this);
}
