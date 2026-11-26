// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mls_epoch_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MlsEpochEnvelope _$MlsEpochEnvelopeFromJson(Map<String, dynamic> json) =>
    MlsEpochEnvelope(
      data: MlsEpochDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$MlsEpochEnvelopeToJson(MlsEpochEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
