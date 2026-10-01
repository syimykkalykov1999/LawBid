// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_assistant_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateAssistantDto _$UpdateAssistantDtoFromJson(Map<String, dynamic> json) =>
    UpdateAssistantDto(
      name: json['name'] as String?,
      duties: (json['duties'] as List<dynamic>?)
          ?.map((e) => UpdateAssistantDtoDuties.fromJson(e as String))
          .toList(),
    );

Map<String, dynamic> _$UpdateAssistantDtoToJson(UpdateAssistantDto instance) =>
    <String, dynamic>{
      'name': ?instance.name,
      'duties': ?instance.duties?.map((e) => e.toJson()).toList(),
    };
