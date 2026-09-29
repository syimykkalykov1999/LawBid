// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'data_request_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DataRequestEnvelope _$DataRequestEnvelopeFromJson(Map<String, dynamic> json) =>
    DataRequestEnvelope(
      data: DataRequestDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$DataRequestEnvelopeToJson(
  DataRequestEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
