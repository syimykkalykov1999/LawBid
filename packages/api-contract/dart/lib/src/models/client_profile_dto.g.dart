// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'client_profile_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ClientProfileDto _$ClientProfileDtoFromJson(Map<String, dynamic> json) =>
    ClientProfileDto(
      id: json['id'] as String,
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
      state: StateRefDto.fromJson(json['state'] as Map<String, dynamic>),
      languages: (json['languages'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      contactMethod: json['contactMethod'] == null
          ? null
          : ContactMethod.fromJson(json['contactMethod'] as String),
      contactNote: json['contactNote'] as String?,
    );

Map<String, dynamic> _$ClientProfileDtoToJson(ClientProfileDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'firstName': ?instance.firstName,
      'lastName': ?instance.lastName,
      'state': instance.state.toJson(),
      'languages': instance.languages,
      'contactMethod': ?instance.contactMethod?.toJson(),
      'contactNote': ?instance.contactNote,
    };
