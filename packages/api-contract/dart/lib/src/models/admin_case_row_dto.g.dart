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
      imagesCount: (json['imagesCount'] as num).toInt(),
      documentsCount: (json['documentsCount'] as num).toInt(),
      dossierScore: (json['dossierScore'] as num).toInt(),
      dossierMissing: (json['dossierMissing'] as List<dynamic>)
          .map((e) => AdminCaseRowDtoDossierMissing.fromJson(e as String))
          .toList(),
      urgency: json['urgency'] == null
          ? null
          : CaseUrgency.fromJson(json['urgency'] as String),
      urgencyLevel: json['urgencyLevel'] == null
          ? null
          : CaseUrgencyLevel.fromJson(json['urgencyLevel'] as String),
      deadlineAt: json['deadlineAt'] == null
          ? null
          : DateTime.parse(json['deadlineAt'] as String),
      deadlineKind: json['deadlineKind'] == null
          ? null
          : CaseDeadlineKind.fromJson(json['deadlineKind'] as String),
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
      'imagesCount': instance.imagesCount,
      'documentsCount': instance.documentsCount,
      'dossierScore': instance.dossierScore,
      'dossierMissing': instance.dossierMissing.map((e) => e.toJson()).toList(),
      'urgency': ?instance.urgency?.toJson(),
      'urgencyLevel': ?instance.urgencyLevel?.toJson(),
      'deadlineAt': ?instance.deadlineAt?.toIso8601String(),
      'deadlineKind': ?instance.deadlineKind?.toJson(),
      'lastActivityAt': instance.lastActivityAt.toIso8601String(),
      'createdAt': instance.createdAt.toIso8601String(),
    };
