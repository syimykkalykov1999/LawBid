// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'key_package_count_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

KeyPackageCountEnvelope _$KeyPackageCountEnvelopeFromJson(
  Map<String, dynamic> json,
) => KeyPackageCountEnvelope(
  data: KeyPackageCountDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$KeyPackageCountEnvelopeToJson(
  KeyPackageCountEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
