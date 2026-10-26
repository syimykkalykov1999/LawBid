// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'minor_confirmed_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MinorConfirmedEnvelope _$MinorConfirmedEnvelopeFromJson(
  Map<String, dynamic> json,
) => MinorConfirmedEnvelope(
  data: MinorConfirmedDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$MinorConfirmedEnvelopeToJson(
  MinorConfirmedEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
