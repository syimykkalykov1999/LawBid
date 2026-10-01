// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'work_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

WorkItemDto _$WorkItemDtoFromJson(Map<String, dynamic> json) => WorkItemDto(
  caseId: json['caseId'] as String,
  bidId: json['bidId'] as String,
  title: json['title'] as String,
  status: CaseStatus.fromJson(json['status'] as String),
  primaryStateCode: json['primaryStateCode'] as String,
  practiceAreaNameEn: json['practiceAreaNameEn'] as String,
  practiceAreaI18nKey: json['practiceAreaI18nKey'] as String,
  practiceAreaCode: json['practiceAreaCode'] as String,
  feeType: FeeType.fromJson(json['feeType'] as String),
  amountCents: (json['amountCents'] as num).toInt(),
  clientName: json['clientName'] as String?,
  autoCloseAt: json['autoCloseAt'] as String?,
  acceptedAt: json['acceptedAt'] as String?,
  closedAt: json['closedAt'] as String?,
  coverUrl: json['coverUrl'] as String?,
);

Map<String, dynamic> _$WorkItemDtoToJson(WorkItemDto instance) =>
    <String, dynamic>{
      'caseId': instance.caseId,
      'bidId': instance.bidId,
      'title': instance.title,
      'status': instance.status.toJson(),
      'primaryStateCode': instance.primaryStateCode,
      'practiceAreaNameEn': instance.practiceAreaNameEn,
      'practiceAreaI18nKey': instance.practiceAreaI18nKey,
      'practiceAreaCode': instance.practiceAreaCode,
      'clientName': ?instance.clientName,
      'feeType': instance.feeType.toJson(),
      'amountCents': instance.amountCents,
      'autoCloseAt': ?instance.autoCloseAt,
      'acceptedAt': ?instance.acceptedAt,
      'closedAt': ?instance.closedAt,
      'coverUrl': ?instance.coverUrl,
    };
