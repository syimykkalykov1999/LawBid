// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_client_profile_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateClientProfileDto _$UpdateClientProfileDtoFromJson(
  Map<String, dynamic> json,
) => UpdateClientProfileDto(
  firstName: json['firstName'] as String?,
  lastName: json['lastName'] as String?,
  stateCode: json['stateCode'] as String?,
  languages: (json['languages'] as List<dynamic>?)
      ?.map((e) => UpdateClientProfileDtoLanguages.fromJson(e as String))
      .toList(),
  contactMethod: json['contactMethod'] == null
      ? null
      : UpdateClientProfileDtoContactMethod.fromJson(
          json['contactMethod'] as String,
        ),
  contactNote: json['contactNote'] as String?,
);

Map<String, dynamic> _$UpdateClientProfileDtoToJson(
  UpdateClientProfileDto instance,
) => <String, dynamic>{
  'firstName': ?instance.firstName,
  'lastName': ?instance.lastName,
  'stateCode': ?instance.stateCode,
  'languages': ?instance.languages?.map((e) => e.toJson()).toList(),
  'contactMethod': ?instance.contactMethod?.toJson(),
  'contactNote': ?instance.contactNote,
};
