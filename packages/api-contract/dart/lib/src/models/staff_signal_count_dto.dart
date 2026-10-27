// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'staff_signal_count_dto.g.dart';

@JsonSerializable()
class StaffSignalCountDto {
  const StaffSignalCountDto({
    required this.kind,
    required this.label,
    required this.count,
  });

  factory StaffSignalCountDto.fromJson(Map<String, Object?> json) =>
      _$StaffSignalCountDtoFromJson(json);

  final String kind;
  final String label;
  final int count;

  Map<String, Object?> toJson() => _$StaffSignalCountDtoToJson(this);
}
