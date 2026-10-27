// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'private_case_files_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PrivateCaseFilesEnvelope _$PrivateCaseFilesEnvelopeFromJson(
  Map<String, dynamic> json,
) => PrivateCaseFilesEnvelope(
  data: PrivateCaseFilesDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PrivateCaseFilesEnvelopeToJson(
  PrivateCaseFilesEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
