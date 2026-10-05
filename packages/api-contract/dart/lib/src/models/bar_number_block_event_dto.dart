// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'bar_number_block_event_dto_kind.dart';
import 'staff_admin_dto.dart';

part 'bar_number_block_event_dto.g.dart';

@JsonSerializable()
class BarNumberBlockEventDto {
  const BarNumberBlockEventDto({
    required this.id,
    required this.kind,
    required this.actorType,
    required this.actor,
    required this.reason,
    required this.details,
    required this.createdAt,
  });

  factory BarNumberBlockEventDto.fromJson(Map<String, Object?> json) =>
      _$BarNumberBlockEventDtoFromJson(json);

  final String id;
  final BarNumberBlockEventDtoKind kind;

  /// admin / system / attorney
  final String actorType;
  final StaffAdminDto? actor;
  final String? reason;
  final dynamic details;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$BarNumberBlockEventDtoToJson(this);
}
