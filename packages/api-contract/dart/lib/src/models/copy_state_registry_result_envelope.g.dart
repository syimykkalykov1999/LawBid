// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'copy_state_registry_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CopyStateRegistryResultEnvelope _$CopyStateRegistryResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => CopyStateRegistryResultEnvelope(
  data: CopyStateRegistryResultDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CopyStateRegistryResultEnvelopeToJson(
  CopyStateRegistryResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
