// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'username_availability_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UsernameAvailabilityEnvelope _$UsernameAvailabilityEnvelopeFromJson(
  Map<String, dynamic> json,
) => UsernameAvailabilityEnvelope(
  data: UsernameAvailabilityDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$UsernameAvailabilityEnvelopeToJson(
  UsernameAvailabilityEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
