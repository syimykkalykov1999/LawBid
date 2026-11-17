// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_videos_filter_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminVideosFilterDto _$AdminVideosFilterDtoFromJson(
  Map<String, dynamic> json,
) => AdminVideosFilterDto(
  status: json['status'] == null
      ? null
      : AdminVideoStatus.fromJson(json['status'] as String),
  ownerId: json['ownerId'] as String?,
  from: json['from'] == null ? null : DateTime.parse(json['from'] as String),
  to: json['to'] == null ? null : DateTime.parse(json['to'] as String),
);

Map<String, dynamic> _$AdminVideosFilterDtoToJson(
  AdminVideosFilterDto instance,
) => <String, dynamic>{
  'status': ?instance.status?.toJson(),
  'ownerId': ?instance.ownerId,
  'from': ?instance.from?.toIso8601String(),
  'to': ?instance.to?.toIso8601String(),
};
