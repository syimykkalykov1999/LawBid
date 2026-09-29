// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'read_notifications_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReadNotificationsResultEnvelope _$ReadNotificationsResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => ReadNotificationsResultEnvelope(
  data: ReadNotificationsResultDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ReadNotificationsResultEnvelopeToJson(
  ReadNotificationsResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
