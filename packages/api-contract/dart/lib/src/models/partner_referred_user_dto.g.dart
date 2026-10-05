// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'partner_referred_user_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PartnerReferredUserDto _$PartnerReferredUserDtoFromJson(
  Map<String, dynamic> json,
) => PartnerReferredUserDto(
  id: json['id'] as String,
  role: PartnerReferredUserDtoRole.fromJson(json['role'] as String),
  status: PartnerReferredStatus.fromJson(json['status'] as String),
  amountCents: (json['amountCents'] as num).toInt(),
  joinedAt: DateTime.parse(json['joinedAt'] as String),
  name: json['name'] as String?,
  qualifiedAt: json['qualifiedAt'] == null
      ? null
      : DateTime.parse(json['qualifiedAt'] as String),
);

Map<String, dynamic> _$PartnerReferredUserDtoToJson(
  PartnerReferredUserDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'name': ?instance.name,
  'role': instance.role.toJson(),
  'status': instance.status.toJson(),
  'amountCents': instance.amountCents,
  'joinedAt': instance.joinedAt.toIso8601String(),
  'qualifiedAt': ?instance.qualifiedAt?.toIso8601String(),
};
