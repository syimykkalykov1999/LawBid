// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'staff_today_piecework_dto.g.dart';

@JsonSerializable()
class StaffTodayPieceworkDto {
  const StaffTodayPieceworkDto({required this.disputedDays});

  factory StaffTodayPieceworkDto.fromJson(Map<String, Object?> json) =>
      _$StaffTodayPieceworkDtoFromJson(json);

  /// Days held in dispute (last 31 days).
  final int disputedDays;

  Map<String, Object?> toJson() => _$StaffTodayPieceworkDtoToJson(this);
}
