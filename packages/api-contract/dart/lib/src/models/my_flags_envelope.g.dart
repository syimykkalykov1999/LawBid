// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'my_flags_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MyFlagsEnvelope _$MyFlagsEnvelopeFromJson(Map<String, dynamic> json) =>
    MyFlagsEnvelope(
      data: MyFlagsDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$MyFlagsEnvelopeToJson(MyFlagsEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
