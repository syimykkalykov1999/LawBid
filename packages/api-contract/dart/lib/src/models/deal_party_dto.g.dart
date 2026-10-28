// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'deal_party_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DealPartyDto _$DealPartyDtoFromJson(Map<String, dynamic> json) => DealPartyDto(
  fullName: json['fullName'] as String,
  email: json['email'] as String?,
  username: json['username'] as String?,
);

Map<String, dynamic> _$DealPartyDtoToJson(DealPartyDto instance) =>
    <String, dynamic>{
      'fullName': instance.fullName,
      'email': ?instance.email,
      'username': ?instance.username,
    };
