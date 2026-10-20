// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'qr_login_preview_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

QrLoginPreviewEnvelope _$QrLoginPreviewEnvelopeFromJson(
  Map<String, dynamic> json,
) => QrLoginPreviewEnvelope(
  data: QrLoginPreviewDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$QrLoginPreviewEnvelopeToJson(
  QrLoginPreviewEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
