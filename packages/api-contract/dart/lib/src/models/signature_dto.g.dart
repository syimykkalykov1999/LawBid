// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'signature_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SignatureDto _$SignatureDtoFromJson(Map<String, dynamic> json) => SignatureDto(
  role: SignatureDtoRole.fromJson(json['role'] as String),
  name: json['name'] as String,
  method: SignatureDtoMethod.fromJson(json['method'] as String),
  signedAt: DateTime.parse(json['signedAt'] as String),
);

Map<String, dynamic> _$SignatureDtoToJson(SignatureDto instance) =>
    <String, dynamic>{
      'role': instance.role.toJson(),
      'name': instance.name,
      'method': instance.method.toJson(),
      'signedAt': instance.signedAt.toIso8601String(),
    };
