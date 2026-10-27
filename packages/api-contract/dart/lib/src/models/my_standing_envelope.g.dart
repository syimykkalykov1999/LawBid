// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'my_standing_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MyStandingEnvelope _$MyStandingEnvelopeFromJson(Map<String, dynamic> json) =>
    MyStandingEnvelope(
      data: MyStandingDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$MyStandingEnvelopeToJson(MyStandingEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
