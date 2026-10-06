// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'demo_account_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DemoAccountDto _$DemoAccountDtoFromJson(Map<String, dynamic> json) =>
    DemoAccountDto(
      id: json['id'] as String,
      role: DemoRole.fromJson(json['role'] as String),
      displayName: json['displayName'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      lastSeenAt: json['lastSeenAt'] == null
          ? null
          : DateTime.parse(json['lastSeenAt'] as String),
      expiresAt: DateTime.parse(json['expiresAt'] as String),
    );

Map<String, dynamic> _$DemoAccountDtoToJson(DemoAccountDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'role': instance.role.toJson(),
      'displayName': instance.displayName,
      'createdAt': instance.createdAt.toIso8601String(),
      'lastSeenAt': ?instance.lastSeenAt?.toIso8601String(),
      'expiresAt': instance.expiresAt.toIso8601String(),
    };
