// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outreach_send_email_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OutreachSendEmailResultEnvelope _$OutreachSendEmailResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => OutreachSendEmailResultEnvelope(
  data: OutreachSendEmailResultDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$OutreachSendEmailResultEnvelopeToJson(
  OutreachSendEmailResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
