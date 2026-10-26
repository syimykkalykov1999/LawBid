// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'legal_lookup_hit_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LegalLookupHitDto _$LegalLookupHitDtoFromJson(Map<String, dynamic> json) =>
    LegalLookupHitDto(
      userId: json['userId'] as String,
      name: json['name'] as String?,
      role: json['role'] as String?,
      status: json['status'] as String,
      phone: json['phone'] as String?,
      email: json['email'] as String?,
      username: json['username'] as String?,
      matchedBy: json['matchedBy'] as String,
    );

Map<String, dynamic> _$LegalLookupHitDtoToJson(LegalLookupHitDto instance) =>
    <String, dynamic>{
      'userId': instance.userId,
      'name': ?instance.name,
      'role': ?instance.role,
      'status': instance.status,
      'phone': ?instance.phone,
      'email': ?instance.email,
      'username': ?instance.username,
      'matchedBy': instance.matchedBy,
    };
