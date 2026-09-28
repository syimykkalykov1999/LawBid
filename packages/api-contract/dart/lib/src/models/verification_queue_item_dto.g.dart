// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'verification_queue_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VerificationQueueItemDto _$VerificationQueueItemDtoFromJson(
  Map<String, dynamic> json,
) => VerificationQueueItemDto(
  id: json['id'] as String,
  status: VerificationRequestStatus.fromJson(json['status'] as String),
  submittedAt: json['submittedAt'] == null
      ? null
      : DateTime.parse(json['submittedAt'] as String),
  attorney: AdminAttorneySummaryDto.fromJson(
    json['attorney'] as Map<String, dynamic>,
  ),
  stateCodes: (json['stateCodes'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  reviewerId: json['reviewerId'] as String?,
  adminNote: json['adminNote'] as String?,
);

Map<String, dynamic> _$VerificationQueueItemDtoToJson(
  VerificationQueueItemDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'status': instance.status.toJson(),
  'submittedAt': ?instance.submittedAt?.toIso8601String(),
  'attorney': instance.attorney.toJson(),
  'stateCodes': instance.stateCodes,
  'reviewerId': ?instance.reviewerId,
  'adminNote': ?instance.adminNote,
};
