// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_party_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPartyDto _$AdminPartyDtoFromJson(Map<String, dynamic> json) =>
    AdminPartyDto(
      id: json['id'] as String,
      role: json['role'] as String?,
      status: json['status'] as String,
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
      username: json['username'] as String?,
    );

Map<String, dynamic> _$AdminPartyDtoToJson(AdminPartyDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'role': ?instance.role,
      'status': instance.status,
      'firstName': ?instance.firstName,
      'lastName': ?instance.lastName,
      'username': ?instance.username,
    };
