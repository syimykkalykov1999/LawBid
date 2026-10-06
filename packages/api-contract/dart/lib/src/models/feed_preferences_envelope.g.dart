// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'feed_preferences_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FeedPreferencesEnvelope _$FeedPreferencesEnvelopeFromJson(
  Map<String, dynamic> json,
) => FeedPreferencesEnvelope(
  data: FeedPreferencesDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$FeedPreferencesEnvelopeToJson(
  FeedPreferencesEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
