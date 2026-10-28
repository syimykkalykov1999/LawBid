// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'deal_attorney_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DealAttorneyDto _$DealAttorneyDtoFromJson(Map<String, dynamic> json) =>
    DealAttorneyDto(
      fullName: json['fullName'] as String,
      email: json['email'] as String?,
      username: json['username'] as String?,
      barState: json['barState'] as String?,
      barNumber: json['barNumber'] as String?,
      firmName: json['firmName'] as String?,
    );

Map<String, dynamic> _$DealAttorneyDtoToJson(DealAttorneyDto instance) =>
    <String, dynamic>{
      'fullName': instance.fullName,
      'email': ?instance.email,
      'username': ?instance.username,
      'barState': ?instance.barState,
      'barNumber': ?instance.barNumber,
      'firmName': ?instance.firmName,
    };
