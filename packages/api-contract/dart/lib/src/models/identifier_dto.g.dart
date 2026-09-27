// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'identifier_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

IdentifierDto _$IdentifierDtoFromJson(Map<String, dynamic> json) =>
    IdentifierDto(
      id: json['id'] as String,
      provider: IdentifierType.fromJson(json['provider'] as String),
      value: json['value'] as String?,
      verified: json['verified'] as bool,
      isPrimaryContact: json['isPrimaryContact'] as bool,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$IdentifierDtoToJson(IdentifierDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'provider': instance.provider.toJson(),
      'value': ?instance.value,
      'verified': instance.verified,
      'isPrimaryContact': instance.isPrimaryContact,
      'createdAt': instance.createdAt.toIso8601String(),
    };
