// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sign_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SignDto _$SignDtoFromJson(Map<String, dynamic> json) => SignDto(
  method: SignDtoMethod.fromJson(json['method'] as String),
  name: json['name'] as String,
  consent: json['consent'] as bool,
  imagePngBase64: json['imagePngBase64'] as String?,
);

Map<String, dynamic> _$SignDtoToJson(SignDto instance) => <String, dynamic>{
  'method': instance.method.toJson(),
  'name': instance.name,
  'imagePngBase64': ?instance.imagePngBase64,
  'consent': instance.consent,
};
