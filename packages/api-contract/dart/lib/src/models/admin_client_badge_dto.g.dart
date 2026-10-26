// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_client_badge_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminClientBadgeDto _$AdminClientBadgeDtoFromJson(Map<String, dynamic> json) =>
    AdminClientBadgeDto(
      id: json['id'] as String,
      userId: json['userId'] as String,
      status: AdminClientBadgeDtoStatus.fromJson(json['status'] as String),
      subStatus: AdminClientBadgeDtoSubStatus.fromJson(
        json['subStatus'] as String,
      ),
      badgeActive: json['badgeActive'] as bool,
      documentsCount: (json['documentsCount'] as num).toInt(),
      submittedAt: json['submittedAt'] as String,
      cancelAtPeriodEnd: json['cancelAtPeriodEnd'] as bool,
      documents: (json['documents'] as List<dynamic>)
          .map(
            (e) =>
                AdminClientBadgeDocumentDto.fromJson(e as Map<String, dynamic>),
          )
          .toList(),
      displayName: json['displayName'] as String?,
      username: json['username'] as String?,
      reviewedAt: json['reviewedAt'] as String?,
      note: json['note'] as String?,
      rejectReason: json['rejectReason'] as String?,
      revokeReason: json['revokeReason'] as String?,
      currentPeriodEnd: json['currentPeriodEnd'] as String?,
    );

Map<String, dynamic> _$AdminClientBadgeDtoToJson(
  AdminClientBadgeDto instance,
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
  'note': ?instance.note,
  'rejectReason': ?instance.rejectReason,
  'revokeReason': ?instance.revokeReason,
  'currentPeriodEnd': ?instance.currentPeriodEnd,
  'cancelAtPeriodEnd': instance.cancelAtPeriodEnd,
  'documents': instance.documents.map((e) => e.toJson()).toList(),
};
