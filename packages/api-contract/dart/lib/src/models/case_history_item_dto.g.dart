// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_history_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseHistoryItemDto _$CaseHistoryItemDtoFromJson(Map<String, dynamic> json) =>
    CaseHistoryItemDto(
      id: json['id'] as String,
      title: json['title'] as String,
      practiceArea: HistoryPracticeAreaDto.fromJson(
        json['practiceArea'] as Map<String, dynamic>,
      ),
      primaryStateCode: json['primaryStateCode'] as String,
      status: json['status'] as String,
      deleted: json['deleted'] as bool,
      createdAt: json['createdAt'] as String,
      closedAt: json['closedAt'] as String?,
      archivedAt: json['archivedAt'] as String?,
      acceptedBid: json['acceptedBid'] == null
          ? null
          : HistoryAcceptedBidDto.fromJson(
              json['acceptedBid'] as Map<String, dynamic>,
            ),
    );

Map<String, dynamic> _$CaseHistoryItemDtoToJson(CaseHistoryItemDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'title': instance.title,
      'practiceArea': instance.practiceArea.toJson(),
      'primaryStateCode': instance.primaryStateCode,
      'status': instance.status,
      'deleted': instance.deleted,
      'createdAt': instance.createdAt,
      'closedAt': ?instance.closedAt,
      'archivedAt': ?instance.archivedAt,
      'acceptedBid': ?instance.acceptedBid?.toJson(),
    };
