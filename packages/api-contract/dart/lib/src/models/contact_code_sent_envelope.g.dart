// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'contact_code_sent_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ContactCodeSentEnvelope _$ContactCodeSentEnvelopeFromJson(
  Map<String, dynamic> json,
) => ContactCodeSentEnvelope(
  data: ContactCodeSentDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ContactCodeSentEnvelopeToJson(
  ContactCodeSentEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
