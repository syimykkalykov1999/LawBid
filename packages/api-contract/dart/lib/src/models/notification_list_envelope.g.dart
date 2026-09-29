// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'notification_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

NotificationListEnvelope _$NotificationListEnvelopeFromJson(
  Map<String, dynamic> json,
) => NotificationListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => NotificationDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$NotificationListEnvelopeToJson(
  NotificationListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
