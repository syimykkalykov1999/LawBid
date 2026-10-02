// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_client_badge_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminClientBadgeRowDto _$AdminClientBadgeRowDtoFromJson(
  Map<String, dynamic> json,
) => AdminClientBadgeRowDto(
  id: json['id'] as String,
  userId: json['userId'] as String,
  status: AdminClientBadgeRowDtoStatus.fromJson(json['status'] as String),
  subStatus: AdminClientBadgeRowDtoSubStatus.fromJson(
    json['subStatus'] as String,
  ),
  badgeActive: json['badgeActive'] as bool,
  documentsCount: (json['documentsCount'] as num).toInt(),
  submittedAt: json['submittedAt'] as String,
  displayName: json['displayName'] as String?,
  username: json['username'] as String?,
  reviewedAt: json['reviewedAt'] as String?,
);

Map<String, dynamic> _$AdminClientBadgeRowDtoToJson(
  AdminClientBadgeRowDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'userId': instance.userId,
  'displayName': ?instance.displayName,
  'username': ?instance.username,
  'status': instance.status.toJson(),
  'subStatus': instance.subStatus.toJson(),
  'badgeActive': instance.badgeActive,
  'documentsCount': instance.documentsCount,
  'submittedAt': instance.submittedAt,
  'reviewedAt': ?instance.reviewedAt,
};
