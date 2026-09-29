// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'work_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

WorkItemDto _$WorkItemDtoFromJson(Map<String, dynamic> json) => WorkItemDto(
  caseId: json['caseId'] as String,
  bidId: json['bidId'] as String,
  title: json['title'] as String,
  status: json['status'] as String,
  feeType: json['feeType'] as String,
  amountCents: json['amountCents'] as num,
  clientName: json['clientName'] as String?,
  autoCloseAt: json['autoCloseAt'] as String?,
  acceptedAt: json['acceptedAt'] as String?,
  closedAt: json['closedAt'] as String?,
);

Map<String, dynamic> _$WorkItemDtoToJson(WorkItemDto instance) =>
    <String, dynamic>{
      'caseId': instance.caseId,
      'bidId': instance.bidId,
      'title': instance.title,
      'status': instance.status,
      'clientName': ?instance.clientName,
      'feeType': instance.feeType,
      'amountCents': instance.amountCents,
      'autoCloseAt': ?instance.autoCloseAt,
      'acceptedAt': ?instance.acceptedAt,
      'closedAt': ?instance.closedAt,
    };
