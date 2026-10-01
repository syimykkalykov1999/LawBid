// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'phone_changed_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PhoneChangedEnvelope _$PhoneChangedEnvelopeFromJson(
  Map<String, dynamic> json,
) => PhoneChangedEnvelope(
  data: PhoneChangedDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PhoneChangedEnvelopeToJson(
  PhoneChangedEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
