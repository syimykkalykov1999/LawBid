// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'minors_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MinorsListEnvelope _$MinorsListEnvelopeFromJson(Map<String, dynamic> json) =>
    MinorsListEnvelope(
      data: MinorsListDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$MinorsListEnvelopeToJson(MinorsListEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
