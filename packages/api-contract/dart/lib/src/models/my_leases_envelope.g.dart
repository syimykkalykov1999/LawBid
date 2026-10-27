// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'my_leases_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MyLeasesEnvelope _$MyLeasesEnvelopeFromJson(Map<String, dynamic> json) =>
    MyLeasesEnvelope(
      data: MyLeasesDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$MyLeasesEnvelopeToJson(MyLeasesEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
