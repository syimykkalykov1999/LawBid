// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'passkey_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PasskeyDto _$PasskeyDtoFromJson(Map<String, dynamic> json) => PasskeyDto(
  id: json['id'] as String,
  name: json['name'] as String,
  deviceType: PasskeyDtoDeviceType.fromJson(json['deviceType'] as String),
  backedUp: json['backedUp'] as bool,
  transports: (json['transports'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  createdAt: DateTime.parse(json['createdAt'] as String),
  lastUsedAt: json['lastUsedAt'] == null
      ? null
      : DateTime.parse(json['lastUsedAt'] as String),
);

Map<String, dynamic> _$PasskeyDtoToJson(PasskeyDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'deviceType': instance.deviceType.toJson(),
      'backedUp': instance.backedUp,
      'transports': instance.transports,
      'createdAt': instance.createdAt.toIso8601String(),
      'lastUsedAt': ?instance.lastUsedAt?.toIso8601String(),
    };
