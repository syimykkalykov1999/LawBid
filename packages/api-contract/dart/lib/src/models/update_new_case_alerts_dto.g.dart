// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_new_case_alerts_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateNewCaseAlertsDto _$UpdateNewCaseAlertsDtoFromJson(
  Map<String, dynamic> json,
) => UpdateNewCaseAlertsDto(
  useProfile: json['useProfile'] as bool,
  practiceAreaIds: (json['practiceAreaIds'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
  urgentOnly: json['urgentOnly'] as bool?,
);

Map<String, dynamic> _$UpdateNewCaseAlertsDtoToJson(
  UpdateNewCaseAlertsDto instance,
) => <String, dynamic>{
  'useProfile': instance.useProfile,
  'practiceAreaIds': ?instance.practiceAreaIds,
  'urgentOnly': ?instance.urgentOnly,
};
