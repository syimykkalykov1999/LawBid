// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'social_nonce_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SocialNonceDto _$SocialNonceDtoFromJson(Map<String, dynamic> json) =>
    SocialNonceDto(
      nonce: json['nonce'] as String,
      expiresAt: DateTime.parse(json['expiresAt'] as String),
    );

Map<String, dynamic> _$SocialNonceDtoToJson(SocialNonceDto instance) =>
    <String, dynamic>{
      'nonce': instance.nonce,
      'expiresAt': instance.expiresAt.toIso8601String(),
    };
