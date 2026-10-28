// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'deal_signature_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DealSignatureDto _$DealSignatureDtoFromJson(Map<String, dynamic> json) =>
    DealSignatureDto(
      role: PartyRole.fromJson(json['role'] as String),
      name: json['name'] as String,
      signedAt: DateTime.parse(json['signedAt'] as String),
    );

Map<String, dynamic> _$DealSignatureDtoToJson(DealSignatureDto instance) =>
    <String, dynamic>{
      'role': instance.role.toJson(),
      'name': instance.name,
      'signedAt': instance.signedAt.toIso8601String(),
    };
