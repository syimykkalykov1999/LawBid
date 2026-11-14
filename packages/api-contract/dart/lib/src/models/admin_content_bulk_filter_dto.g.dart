// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_content_bulk_filter_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminContentBulkFilterDto _$AdminContentBulkFilterDtoFromJson(
  Map<String, dynamic> json,
) => AdminContentBulkFilterDto(
  q: json['q'] as String?,
  authorId: json['authorId'] as String?,
  from: json['from'] == null ? null : DateTime.parse(json['from'] as String),
  to: json['to'] == null ? null : DateTime.parse(json['to'] as String),
  kind: json['kind'] == null
      ? null
      : AdminPostKind.fromJson(json['kind'] as String),
  media: json['media'] == null
      ? null
      : AdminContentBulkFilterDtoMedia.fromJson(json['media'] as String),
  contentClass: json['contentClass'] == null
      ? null
      : PostContentClass.fromJson(json['contentClass'] as String),
  status: json['status'] == null
      ? null
      : AdminReviewStatus.fromJson(json['status'] as String),
);

Map<String, dynamic> _$AdminContentBulkFilterDtoToJson(
  AdminContentBulkFilterDto instance,
) => <String, dynamic>{
  'q': ?instance.q,
  'authorId': ?instance.authorId,
  'from': ?instance.from?.toIso8601String(),
  'to': ?instance.to?.toIso8601String(),
  'kind': ?instance.kind?.toJson(),
  'media': ?instance.media?.toJson(),
  'contentClass': ?instance.contentClass?.toJson(),
  'status': ?instance.status?.toJson(),
};
