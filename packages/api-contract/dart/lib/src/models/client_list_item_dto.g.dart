// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'client_list_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ClientListItemDto _$ClientListItemDtoFromJson(Map<String, dynamic> json) =>
    ClientListItemDto(
      id: json['id'] as String,
      username: json['username'] as String,
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
      stateCode: json['stateCode'] as String,
    );

Map<String, dynamic> _$ClientListItemDtoToJson(ClientListItemDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'username': instance.username,
      'firstName': ?instance.firstName,
      'lastName': ?instance.lastName,
      'avatarUrl': ?instance.avatarUrl,
      'stateCode': instance.stateCode,
    };
