// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'add_assistant_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AddAssistantDto _$AddAssistantDtoFromJson(Map<String, dynamic> json) =>
    AddAssistantDto(
      phone: json['phone'] as String,
      name: json['name'] as String?,
      duties: (json['duties'] as List<dynamic>?)
          ?.map((e) => AddAssistantDtoDuties.fromJson(e as String))
          .toList(),
      acceptLiability: json['acceptLiability'] as bool?,
    );

Map<String, dynamic> _$AddAssistantDtoToJson(AddAssistantDto instance) =>
    <String, dynamic>{
      'phone': instance.phone,
      'name': ?instance.name,
      'duties': ?instance.duties?.map((e) => e.toJson()).toList(),
      'acceptLiability': ?instance.acceptLiability,
    };
