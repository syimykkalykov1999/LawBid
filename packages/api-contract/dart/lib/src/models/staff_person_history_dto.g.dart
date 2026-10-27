// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_person_history_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffPersonHistoryDto _$StaffPersonHistoryDtoFromJson(
  Map<String, dynamic> json,
) => StaffPersonHistoryDto(
  adminId: json['adminId'] as String,
  state: StaffPersonHistoryDtoState.fromJson(json['state'] as String),
  stateUntil: json['stateUntil'] == null
      ? null
      : DateTime.parse(json['stateUntil'] as String),
  signals: (json['signals'] as List<dynamic>)
      .map((e) => StaffSignalCountDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  actions: (json['actions'] as List<dynamic>)
      .map((e) => StaffActionRowDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  recommendations: (json['recommendations'] as List<dynamic>)
      .map(
        (e) => StaffOpenRecommendationDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
);

Map<String, dynamic> _$StaffPersonHistoryDtoToJson(
  StaffPersonHistoryDto instance,
) => <String, dynamic>{
  'adminId': instance.adminId,
  'state': instance.state.toJson(),
  'stateUntil': ?instance.stateUntil?.toIso8601String(),
  'signals': instance.signals.map((e) => e.toJson()).toList(),
  'actions': instance.actions.map((e) => e.toJson()).toList(),
  'recommendations': instance.recommendations.map((e) => e.toJson()).toList(),
};
