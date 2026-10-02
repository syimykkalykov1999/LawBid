// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_ban_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminBanDto _$AdminBanDtoFromJson(Map<String, dynamic> json) => AdminBanDto(
  id: json['id'] as String,
  kind: AdminBanDtoKind.fromJson(json['kind'] as String),
  value: json['value'] as String,
  reason: json['reason'] as String,
  createdAt: json['createdAt'] as String,
  createdBy: json['createdBy'] as String,
  active: json['active'] as bool,
  userId: json['userId'] as String?,
  userName: json['userName'] as String?,
  expiresAt: json['expiresAt'] as String?,
  liftedAt: json['liftedAt'] as String?,
  liftReason: json['liftReason'] as String?,
);

Map<String, dynamic> _$AdminBanDtoToJson(AdminBanDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'kind': instance.kind.toJson(),
      'value': instance.value,
      'userId': ?instance.userId,
      'userName': ?instance.userName,
      'reason': instance.reason,
      'expiresAt': ?instance.expiresAt,
      'createdAt': instance.createdAt,
      'createdBy': instance.createdBy,
      'liftedAt': ?instance.liftedAt,
      'liftReason': ?instance.liftReason,
      'active': instance.active,
    };
