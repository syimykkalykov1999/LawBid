// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'new_case_alerts_dto.g.dart';

@JsonSerializable()
class NewCaseAlertsDto {
  const NewCaseAlertsDto({
    required this.useProfile,
    required this.practiceAreaIds,
    required this.profilePracticeAreaIds,
  });

  factory NewCaseAlertsDto.fromJson(Map<String, Object?> json) =>
      _$NewCaseAlertsDtoFromJson(json);

  /// true = the profile's qualifications (default); false = practiceAreaIds
  final bool useProfile;

  /// The chosen list (custom).
  final List<String> practiceAreaIds;

  /// The profile's qualifications.
  final List<String> profilePracticeAreaIds;

  Map<String, Object?> toJson() => _$NewCaseAlertsDtoToJson(this);
}
