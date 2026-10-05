// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_partner_referred_user_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPartnerReferredUserDto _$AdminPartnerReferredUserDtoFromJson(
  Map<String, dynamic> json,
) => AdminPartnerReferredUserDto(
  id: json['id'] as String,
  role: AdminPartnerReferredUserDtoRole.fromJson(json['role'] as String),
  status: PartnerReferredStatus.fromJson(json['status'] as String),
  amountCents: (json['amountCents'] as num).toInt(),
  joinedAt: DateTime.parse(json['joinedAt'] as String),
  referralId: json['referralId'] as String,
  referralStatus: json['referralStatus'] as String,
  name: json['name'] as String?,
  qualifiedAt: json['qualifiedAt'] == null
      ? null
      : DateTime.parse(json['qualifiedAt'] as String),
  email: json['email'] as String?,
);

Map<String, dynamic> _$AdminPartnerReferredUserDtoToJson(
  AdminPartnerReferredUserDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'name': ?instance.name,
  'role': instance.role.toJson(),
  'status': instance.status.toJson(),
  'amountCents': instance.amountCents,
  'joinedAt': instance.joinedAt.toIso8601String(),
  'qualifiedAt': ?instance.qualifiedAt?.toIso8601String(),
  'email': ?instance.email,
  'referralId': instance.referralId,
  'referralStatus': instance.referralStatus,
};
