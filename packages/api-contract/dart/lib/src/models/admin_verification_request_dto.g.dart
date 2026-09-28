// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_verification_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminVerificationRequestDto _$AdminVerificationRequestDtoFromJson(
  Map<String, dynamic> json,
) => AdminVerificationRequestDto(
  id: json['id'] as String,
  status: VerificationRequestStatus.fromJson(json['status'] as String),
  provider: VerificationProvider.fromJson(json['provider'] as String),
  submittedAt: json['submittedAt'] == null
      ? null
      : DateTime.parse(json['submittedAt'] as String),
  reviewedAt: json['reviewedAt'] == null
      ? null
      : DateTime.parse(json['reviewedAt'] as String),
  reviewerId: json['reviewerId'] as String?,
  applicantComment: json['applicantComment'] as String?,
  infoRequestMessage: json['infoRequestMessage'] as String?,
  rejectionCode: json['rejectionCode'] as String?,
  rejectionReason: json['rejectionReason'] as String?,
  adminNote: json['adminNote'] as String?,
  createdAt: DateTime.parse(json['createdAt'] as String),
  attorney: AdminAttorneySummaryDto.fromJson(
    json['attorney'] as Map<String, dynamic>,
  ),
  licenses: (json['licenses'] as List<dynamic>)
      .map((e) => AdminLicenseDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  documents: (json['documents'] as List<dynamic>)
      .map((e) => AdminDocumentDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  checks: (json['checks'] as List<dynamic>)
      .map((e) => AdminCheckDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  history: (json['history'] as List<dynamic>)
      .map(
        (e) => AdminRequestHistoryItemDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
);

Map<String, dynamic> _$AdminVerificationRequestDtoToJson(
  AdminVerificationRequestDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'status': instance.status.toJson(),
  'provider': instance.provider.toJson(),
  'submittedAt': ?instance.submittedAt?.toIso8601String(),
  'reviewedAt': ?instance.reviewedAt?.toIso8601String(),
  'reviewerId': ?instance.reviewerId,
  'applicantComment': ?instance.applicantComment,
  'infoRequestMessage': ?instance.infoRequestMessage,
  'rejectionCode': ?instance.rejectionCode,
  'rejectionReason': ?instance.rejectionReason,
  'adminNote': ?instance.adminNote,
  'createdAt': instance.createdAt.toIso8601String(),
  'attorney': instance.attorney.toJson(),
  'licenses': instance.licenses.map((e) => e.toJson()).toList(),
  'documents': instance.documents.map((e) => e.toJson()).toList(),
  'checks': instance.checks.map((e) => e.toJson()).toList(),
  'history': instance.history.map((e) => e.toJson()).toList(),
};
