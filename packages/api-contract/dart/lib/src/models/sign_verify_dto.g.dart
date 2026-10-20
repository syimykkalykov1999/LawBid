// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sign_verify_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SignVerifyDto _$SignVerifyDtoFromJson(Map<String, dynamic> json) =>
    SignVerifyDto(
      sourceOk: json['sourceOk'] as bool,
      finalOk: json['finalOk'] as bool?,
      journalOk: json['journalOk'] as bool,
      journalSignatures: json['journalSignatures'] as num,
      sourceSha256: json['sourceSha256'] as String,
      finalSha256: json['finalSha256'] as String?,
    );

Map<String, dynamic> _$SignVerifyDtoToJson(SignVerifyDto instance) =>
    <String, dynamic>{
      'sourceOk': instance.sourceOk,
      'finalOk': ?instance.finalOk,
      'journalOk': instance.journalOk,
      'journalSignatures': instance.journalSignatures,
      'sourceSha256': instance.sourceSha256,
      'finalSha256': ?instance.finalSha256,
    };
