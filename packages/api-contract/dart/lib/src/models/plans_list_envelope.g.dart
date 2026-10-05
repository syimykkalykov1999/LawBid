// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'plans_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PlansListEnvelope _$PlansListEnvelopeFromJson(Map<String, dynamic> json) =>
    PlansListEnvelope(
      data: PlansListDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$PlansListEnvelopeToJson(PlansListEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
