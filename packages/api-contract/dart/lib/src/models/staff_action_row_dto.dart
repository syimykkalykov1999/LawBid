// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'staff_action_row_dto.g.dart';

@JsonSerializable()
class StaffActionRowDto {
  const StaffActionRowDto({
    required this.id,
    required this.kind,
    required this.source,
    required this.reasonCode,
    required this.reasonNote,
    required this.createdAt,
  });

  factory StaffActionRowDto.fromJson(Map<String, Object?> json) =>
      _$StaffActionRowDtoFromJson(json);

  final String id;
  final String kind;
  final String source;
  final String reasonCode;
  final String? reasonNote;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$StaffActionRowDtoToJson(this);
}
