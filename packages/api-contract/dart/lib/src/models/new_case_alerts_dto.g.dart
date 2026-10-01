// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'new_case_alerts_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

NewCaseAlertsDto _$NewCaseAlertsDtoFromJson(Map<String, dynamic> json) =>
    NewCaseAlertsDto(
      useProfile: json['useProfile'] as bool,
      practiceAreaIds: (json['practiceAreaIds'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      profilePracticeAreaIds: (json['profilePracticeAreaIds'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$NewCaseAlertsDtoToJson(NewCaseAlertsDto instance) =>
    <String, dynamic>{
      'useProfile': instance.useProfile,
      'practiceAreaIds': instance.practiceAreaIds,
      'profilePracticeAreaIds': instance.profilePracticeAreaIds,
    };
