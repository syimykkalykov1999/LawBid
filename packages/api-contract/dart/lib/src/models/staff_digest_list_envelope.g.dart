// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_digest_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffDigestListEnvelope _$StaffDigestListEnvelopeFromJson(
  Map<String, dynamic> json,
) => StaffDigestListEnvelope(
  data: StaffDigestListDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StaffDigestListEnvelopeToJson(
  StaffDigestListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
