// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'country_waitlist_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CountryWaitlistResultEnvelope _$CountryWaitlistResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => CountryWaitlistResultEnvelope(
  data: CountryWaitlistResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CountryWaitlistResultEnvelopeToJson(
  CountryWaitlistResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
