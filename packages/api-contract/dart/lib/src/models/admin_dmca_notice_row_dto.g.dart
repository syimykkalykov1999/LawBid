// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_dmca_notice_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminDmcaNoticeRowDto _$AdminDmcaNoticeRowDtoFromJson(
  Map<String, dynamic> json,
) => AdminDmcaNoticeRowDto(
  id: json['id'] as String,
  status: DmcaStatus.fromJson(json['status'] as String),
  complainantName: json['complainantName'] as String,
  complainantEmail: json['complainantEmail'] as String,
  complainantAddress: json['complainantAddress'] as String,
  workDescription: json['workDescription'] as String,
  goodFaith: json['goodFaith'] as bool,
  accuracySworn: json['accuracySworn'] as bool,
  signature: json['signature'] as String,
  createdAt: DateTime.parse(json['createdAt'] as String),
  updatedAt: DateTime.parse(json['updatedAt'] as String),
  reportId: json['reportId'] as String?,
  targetType: json['targetType'] == null
      ? null
      : DmcaTargetType.fromJson(json['targetType'] as String),
  targetId: json['targetId'] as String?,
  infringingUrl: json['infringingUrl'] as String?,
  complainantPhone: json['complainantPhone'] as String?,
  submittedByUserId: json['submittedByUserId'] as String?,
  authorUserId: json['authorUserId'] as String?,
  counter: json['counter'] == null
      ? null
      : AdminDmcaCounterDto.fromJson(json['counter'] as Map<String, dynamic>),
  decidedBy: json['decidedBy'] as String?,
  decidedAt: json['decidedAt'] == null
      ? null
      : DateTime.parse(json['decidedAt'] as String),
  decisionNote: json['decisionNote'] as String?,
);

Map<String, dynamic> _$AdminDmcaNoticeRowDtoToJson(
  AdminDmcaNoticeRowDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'status': instance.status.toJson(),
  'reportId': ?instance.reportId,
  'targetType': ?instance.targetType?.toJson(),
  'targetId': ?instance.targetId,
  'infringingUrl': ?instance.infringingUrl,
  'complainantName': instance.complainantName,
  'complainantEmail': instance.complainantEmail,
  'complainantAddress': instance.complainantAddress,
  'complainantPhone': ?instance.complainantPhone,
  'workDescription': instance.workDescription,
  'goodFaith': instance.goodFaith,
  'accuracySworn': instance.accuracySworn,
  'signature': instance.signature,
  'submittedByUserId': ?instance.submittedByUserId,
  'authorUserId': ?instance.authorUserId,
  'counter': ?instance.counter?.toJson(),
  'decidedBy': ?instance.decidedBy,
  'decidedAt': ?instance.decidedAt?.toIso8601String(),
  'decisionNote': ?instance.decisionNote,
  'createdAt': instance.createdAt.toIso8601String(),
  'updatedAt': instance.updatedAt.toIso8601String(),
};
