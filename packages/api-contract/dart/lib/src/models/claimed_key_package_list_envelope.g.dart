// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'claimed_key_package_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ClaimedKeyPackageListEnvelope _$ClaimedKeyPackageListEnvelopeFromJson(
  Map<String, dynamic> json,
) => ClaimedKeyPackageListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => ClaimedKeyPackageDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ClaimedKeyPackageListEnvelopeToJson(
  ClaimedKeyPackageListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
