// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'contact_upload_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ContactUploadResultEnvelope _$ContactUploadResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => ContactUploadResultEnvelope(
  data: ContactUploadResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ContactUploadResultEnvelopeToJson(
  ContactUploadResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
