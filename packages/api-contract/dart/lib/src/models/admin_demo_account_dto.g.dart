// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_demo_account_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminDemoAccountDto _$AdminDemoAccountDtoFromJson(Map<String, dynamic> json) =>
    AdminDemoAccountDto(
      id: json['id'] as String,
      role: DemoRole.fromJson(json['role'] as String),
      displayName: json['displayName'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      lastSeenAt: json['lastSeenAt'] == null
          ? null
          : DateTime.parse(json['lastSeenAt'] as String),
      expiresAt: DateTime.parse(json['expiresAt'] as String),
      createdBy: DemoCreatedByDto.fromJson(
        json['createdBy'] as Map<String, dynamic>,
      ),
      label: json['label'] as String?,
      hasInvite: json['hasInvite'] as bool,
      inviteExpiresAt: json['inviteExpiresAt'] == null
          ? null
          : DateTime.parse(json['inviteExpiresAt'] as String),
    );

Map<String, dynamic> _$AdminDemoAccountDtoToJson(
  AdminDemoAccountDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'role': instance.role.toJson(),
  'displayName': instance.displayName,
  'createdAt': instance.createdAt.toIso8601String(),
  'lastSeenAt': ?instance.lastSeenAt?.toIso8601String(),
  'expiresAt': instance.expiresAt.toIso8601String(),
  'createdBy': instance.createdBy.toJson(),
  'label': ?instance.label,
  'hasInvite': instance.hasInvite,
  'inviteExpiresAt': ?instance.inviteExpiresAt?.toIso8601String(),
};
