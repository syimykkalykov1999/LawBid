// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_request_history_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminRequestHistoryItemDto _$AdminRequestHistoryItemDtoFromJson(
  Map<String, dynamic> json,
) => AdminRequestHistoryItemDto(
  id: json['id'] as String,
  status: VerificationRequestStatus.fromJson(json['status'] as String),
  submittedAt: json['submittedAt'] == null
      ? null
      : DateTime.parse(json['submittedAt'] as String),
  reviewedAt: json['reviewedAt'] == null
      ? null
      : DateTime.parse(json['reviewedAt'] as String),
  rejectionCode: json['rejectionCode'] as String?,
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$AdminRequestHistoryItemDtoToJson(
  AdminRequestHistoryItemDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'status': instance.status.toJson(),
  'submittedAt': ?instance.submittedAt?.toIso8601String(),
  'reviewedAt': ?instance.reviewedAt?.toIso8601String(),
  'rejectionCode': ?instance.rejectionCode,
  'createdAt': instance.createdAt.toIso8601String(),
};
