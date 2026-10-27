// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_users_bulk_preview_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminUsersBulkPreviewResultEnvelope
_$AdminUsersBulkPreviewResultEnvelopeFromJson(Map<String, dynamic> json) =>
    AdminUsersBulkPreviewResultEnvelope(
      data: AdminUsersBulkPreviewResultDto.fromJson(
        json['data'] as Map<String, dynamic>,
      ),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$AdminUsersBulkPreviewResultEnvelopeToJson(
  AdminUsersBulkPreviewResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
