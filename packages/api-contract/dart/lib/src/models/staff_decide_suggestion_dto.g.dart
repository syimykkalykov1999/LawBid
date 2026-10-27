// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_decide_suggestion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffDecideSuggestionDto _$StaffDecideSuggestionDtoFromJson(
  Map<String, dynamic> json,
) => StaffDecideSuggestionDto(
  action: StaffDecideSuggestionDtoAction.fromJson(json['action'] as String),
  note: json['note'] as String?,
);

Map<String, dynamic> _$StaffDecideSuggestionDtoToJson(
  StaffDecideSuggestionDto instance,
) => <String, dynamic>{
  'action': instance.action.toJson(),
  'note': ?instance.note,
};
