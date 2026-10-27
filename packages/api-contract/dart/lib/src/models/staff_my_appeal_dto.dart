// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_my_appeal_dto_kind.dart';
import 'staff_my_appeal_dto_status.dart';

part 'staff_my_appeal_dto.g.dart';

@JsonSerializable()
class StaffMyAppealDto {
  const StaffMyAppealDto({
    required this.id,
    required this.number,
    required this.status,
    required this.createdAt,
    required this.kind,
    required this.anonymous,
    required this.ackAt,
  });

  factory StaffMyAppealDto.fromJson(Map<String, Object?> json) =>
      _$StaffMyAppealDtoFromJson(json);

  final String id;

  /// Appeal number («автор №N» for anonymous).
  final num number;
  final StaffMyAppealDtoStatus status;
  final DateTime createdAt;
  final StaffMyAppealDtoKind kind;
  final bool anonymous;
  final DateTime? ackAt;

  Map<String, Object?> toJson() => _$StaffMyAppealDtoToJson(this);
}
