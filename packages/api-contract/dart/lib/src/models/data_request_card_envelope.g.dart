// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'data_request_card_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DataRequestCardEnvelope _$DataRequestCardEnvelopeFromJson(
  Map<String, dynamic> json,
) => DataRequestCardEnvelope(
  data: DataRequestCardDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$DataRequestCardEnvelopeToJson(
  DataRequestCardEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
