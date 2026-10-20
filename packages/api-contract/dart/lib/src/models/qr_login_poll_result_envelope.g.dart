// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'qr_login_poll_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

QrLoginPollResultEnvelope _$QrLoginPollResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => QrLoginPollResultEnvelope(
  data: QrLoginPollResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$QrLoginPollResultEnvelopeToJson(
  QrLoginPollResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
