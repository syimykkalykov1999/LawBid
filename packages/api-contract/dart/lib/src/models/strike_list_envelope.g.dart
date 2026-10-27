// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'strike_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StrikeListEnvelope _$StrikeListEnvelopeFromJson(Map<String, dynamic> json) =>
    StrikeListEnvelope(
      data: (json['data'] as List<dynamic>)
          .map((e) => StrikeDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$StrikeListEnvelopeToJson(StrikeListEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.map((e) => e.toJson()).toList(),
      'meta': ?instance.meta?.toJson(),
    };
