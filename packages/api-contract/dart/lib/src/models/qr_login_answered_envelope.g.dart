// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'qr_login_answered_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

QrLoginAnsweredEnvelope _$QrLoginAnsweredEnvelopeFromJson(
  Map<String, dynamic> json,
) => QrLoginAnsweredEnvelope(
  data: QrLoginAnsweredDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$QrLoginAnsweredEnvelopeToJson(
  QrLoginAnsweredEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
