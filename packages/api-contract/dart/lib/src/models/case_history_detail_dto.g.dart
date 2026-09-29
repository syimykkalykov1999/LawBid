// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_history_detail_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseHistoryDetailDto _$CaseHistoryDetailDtoFromJson(
  Map<String, dynamic> json,
) => CaseHistoryDetailDto(
  id: json['id'] as String,
  title: json['title'] as String,
  practiceArea: HistoryPracticeAreaDto.fromJson(
    json['practiceArea'] as Map<String, dynamic>,
  ),
  primaryStateCode: json['primaryStateCode'] as String,
  status: CaseStatus.fromJson(json['status'] as String),
  deleted: json['deleted'] as bool,
  createdAt: json['createdAt'] as String,
  events: (json['events'] as List<dynamic>)
      .map((e) => CaseHistoryEventDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  closedAt: json['closedAt'] as String?,
  archivedAt: json['archivedAt'] as String?,
  acceptedBid: json['acceptedBid'] == null
      ? null
      : HistoryAcceptedBidDto.fromJson(
          json['acceptedBid'] as Map<String, dynamic>,
        ),
  clientName: json['clientName'] as String?,
);

Map<String, dynamic> _$CaseHistoryDetailDtoToJson(
  CaseHistoryDetailDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'title': instance.title,
  'practiceArea': instance.practiceArea.toJson(),
  'primaryStateCode': instance.primaryStateCode,
  'status': instance.status.toJson(),
  'deleted': instance.deleted,
  'createdAt': instance.createdAt,
  'closedAt': ?instance.closedAt,
  'archivedAt': ?instance.archivedAt,
  'acceptedBid': ?instance.acceptedBid?.toJson(),
  'clientName': ?instance.clientName,
  'events': instance.events.map((e) => e.toJson()).toList(),
};
