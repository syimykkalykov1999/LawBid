// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_new_case_alerts_dto.g.dart';

@JsonSerializable()
class UpdateNewCaseAlertsDto {
  const UpdateNewCaseAlertsDto({
    required this.useProfile,
    this.practiceAreaIds,
  });

  factory UpdateNewCaseAlertsDto.fromJson(Map<String, Object?> json) =>
      _$UpdateNewCaseAlertsDtoFromJson(json);

  final bool useProfile;
  final List<String>? practiceAreaIds;

  Map<String, Object?> toJson() => _$UpdateNewCaseAlertsDtoToJson(this);
}
