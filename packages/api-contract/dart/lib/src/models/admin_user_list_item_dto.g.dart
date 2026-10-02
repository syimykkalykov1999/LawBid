// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_user_list_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminUserListItemDto _$AdminUserListItemDtoFromJson(
  Map<String, dynamic> json,
) => AdminUserListItemDto(
  id: json['id'] as String,
  role: json['role'] == null
      ? null
      : AdminUserListItemDtoRole.fromJson(json['role'] as String),
  status: AdminUserListItemDtoStatus.fromJson(json['status'] as String),
  firstName: json['firstName'] as String?,
  lastName: json['lastName'] as String?,
  email: json['email'] as String?,
  username: json['username'] as String?,
  verificationStatus: json['verificationStatus'] as String?,
  avatarUrl: json['avatarUrl'] as String?,
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$AdminUserListItemDtoToJson(
  AdminUserListItemDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'role': ?instance.role?.toJson(),
  'status': instance.status.toJson(),
  'firstName': ?instance.firstName,
  'lastName': ?instance.lastName,
  'email': ?instance.email,
  'username': ?instance.username,
  'verificationStatus': ?instance.verificationStatus,
  'avatarUrl': ?instance.avatarUrl,
  'createdAt': instance.createdAt.toIso8601String(),
};
