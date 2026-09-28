// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'verification_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VerificationRequestDto _$VerificationRequestDtoFromJson(
  Map<String, dynamic> json,
) => VerificationRequestDto(
  id: json['id'] as String,
  status: VerificationRequestStatus.fromJson(json['status'] as String),
  applicantComment: json['applicantComment'] as String?,
  infoRequestMessage: json['infoRequestMessage'] as String?,
  rejectionCode: json['rejectionCode'] as String?,
  rejectionReason: json['rejectionReason'] as String?,
  submittedAt: json['submittedAt'] == null
      ? null
      : DateTime.parse(json['submittedAt'] as String),
  reviewedAt: json['reviewedAt'] == null
      ? null
      : DateTime.parse(json['reviewedAt'] as String),
  createdAt: DateTime.parse(json['createdAt'] as String),
  licenses: (json['licenses'] as List<dynamic>)
      .map((e) => VerificationLicenseDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  documents: (json['documents'] as List<dynamic>)
      .map(
        (e) => OwnVerificationDocumentDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
);

Map<String, dynamic> _$VerificationRequestDtoToJson(
  VerificationRequestDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'status': instance.status.toJson(),
  'applicantComment': ?instance.applicantComment,
  'infoRequestMessage': ?instance.infoRequestMessage,
  'rejectionCode': ?instance.rejectionCode,
  'rejectionReason': ?instance.rejectionReason,
  'submittedAt': ?instance.submittedAt?.toIso8601String(),
  'reviewedAt': ?instance.reviewedAt?.toIso8601String(),
  'createdAt': instance.createdAt.toIso8601String(),
  'licenses': instance.licenses.map((e) => e.toJson()).toList(),
  'documents': instance.documents.map((e) => e.toJson()).toList(),
};
