// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_bulk_filter_preview_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminBulkFilterPreviewEnvelope _$AdminBulkFilterPreviewEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminBulkFilterPreviewEnvelope(
  data: AdminBulkFilterPreviewDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminBulkFilterPreviewEnvelopeToJson(
  AdminBulkFilterPreviewEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
