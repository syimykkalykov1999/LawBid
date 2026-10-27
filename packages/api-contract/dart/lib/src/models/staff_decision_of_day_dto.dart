// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'staff_decision_of_day_dto.g.dart';

@JsonSerializable()
class StaffDecisionOfDayDto {
  const StaffDecisionOfDayDto({
    required this.code,
    required this.title,
    required this.text,
    required this.href,
  });

  factory StaffDecisionOfDayDto.fromJson(Map<String, Object?> json) =>
      _$StaffDecisionOfDayDtoFromJson(json);

  final String code;
  final String title;
  final String text;

  /// Where to decide it (an admin page).
  final String href;

  Map<String, Object?> toJson() => _$StaffDecisionOfDayDtoToJson(this);
}
