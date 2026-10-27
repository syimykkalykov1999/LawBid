// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'auto_action_dto.dart';
import 'reporting_status_dto.dart';
import 'strike_standing_dto.dart';

part 'my_standing_dto.g.dart';

@JsonSerializable()
class MyStandingDto {
  const MyStandingDto({
    required this.strikes,
    required this.reporting,
    required this.autoActions,
  });

  factory MyStandingDto.fromJson(Map<String, Object?> json) =>
      _$MyStandingDtoFromJson(json);

  final StrikeStandingDto strikes;
  final ReportingStatusDto reporting;
  final List<AutoActionDto> autoActions;

  Map<String, Object?> toJson() => _$MyStandingDtoToJson(this);
}
