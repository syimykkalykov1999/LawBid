// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'private_messages_page_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PrivateMessagesPageEnvelope _$PrivateMessagesPageEnvelopeFromJson(
  Map<String, dynamic> json,
) => PrivateMessagesPageEnvelope(
  data: PrivateMessagesPageDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PrivateMessagesPageEnvelopeToJson(
  PrivateMessagesPageEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
