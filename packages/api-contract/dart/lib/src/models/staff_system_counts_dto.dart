// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'staff_system_counts_dto.g.dart';

@JsonSerializable()
class StaffSystemCountsDto {
  const StaffSystemCountsDto({
    required this.critical,
    required this.high,
    required this.medium,
    required this.low,
  });

  factory StaffSystemCountsDto.fromJson(Map<String, Object?> json) =>
      _$StaffSystemCountsDtoFromJson(json);

  final int critical;
  final int high;
  final int medium;
  final int low;

  Map<String, Object?> toJson() => _$StaffSystemCountsDtoToJson(this);
}
