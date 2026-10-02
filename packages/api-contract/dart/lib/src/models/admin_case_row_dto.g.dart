// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_case_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminCaseRowDto _$AdminCaseRowDtoFromJson(Map<String, dynamic> json) =>
    AdminCaseRowDto(
      id: json['id'] as String,
      title: json['title'] as String,
      status: AdminCaseRowDtoStatus.fromJson(json['status'] as String),
      clientId: json['clientId'] as String,
      clientName: json['clientName'] as String,
      practiceAreaId: json['practiceAreaId'] as String,
      practiceAreaName: json['practiceAreaName'] as String,
      stateCode: json['stateCode'] as String,
      bidsCount: (json['bidsCount'] as num).toInt(),
      commentCount: (json['commentCount'] as num).toInt(),
      viewCount: (json['viewCount'] as num).toInt(),
      openReports: (json['openReports'] as num).toInt(),
      promoted: json['promoted'] as bool,
      lastActivityAt: DateTime.parse(json['lastActivityAt'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$AdminCaseRowDtoToJson(AdminCaseRowDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'title': instance.title,
      'status': instance.status.toJson(),
      'clientId': instance.clientId,
      'clientName': instance.clientName,
      'practiceAreaId': instance.practiceAreaId,
      'practiceAreaName': instance.practiceAreaName,
      'stateCode': instance.stateCode,
      'bidsCount': instance.bidsCount,
      'commentCount': instance.commentCount,
      'viewCount': instance.viewCount,
      'openReports': instance.openReports,
      'promoted': instance.promoted,
      'lastActivityAt': instance.lastActivityAt.toIso8601String(),
      'createdAt': instance.createdAt.toIso8601String(),
    };
