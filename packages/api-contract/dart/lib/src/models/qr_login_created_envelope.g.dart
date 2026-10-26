// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'qr_login_created_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

QrLoginCreatedEnvelope _$QrLoginCreatedEnvelopeFromJson(
  Map<String, dynamic> json,
) => QrLoginCreatedEnvelope(
  data: QrLoginCreatedDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$QrLoginCreatedEnvelopeToJson(
  QrLoginCreatedEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
