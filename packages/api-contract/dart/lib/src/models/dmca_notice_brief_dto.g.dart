// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'dmca_notice_brief_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DmcaNoticeBriefDto _$DmcaNoticeBriefDtoFromJson(Map<String, dynamic> json) =>
    DmcaNoticeBriefDto(
      id: json['id'] as String,
      status: DmcaStatus.fromJson(json['status'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
      canCounter: json['canCounter'] as bool,
      targetType: json['targetType'] == null
          ? null
          : DmcaTargetType.fromJson(json['targetType'] as String),
      targetId: json['targetId'] as String?,
      infringingUrl: json['infringingUrl'] as String?,
      decidedAt: json['decidedAt'] == null
          ? null
          : DateTime.parse(json['decidedAt'] as String),
      decisionNote: json['decisionNote'] as String?,
      counterSubmittedAt: json['counterSubmittedAt'] == null
          ? null
          : DateTime.parse(json['counterSubmittedAt'] as String),
    );

Map<String, dynamic> _$DmcaNoticeBriefDtoToJson(DmcaNoticeBriefDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'status': instance.status.toJson(),
      'targetType': ?instance.targetType?.toJson(),
      'targetId': ?instance.targetId,
      'infringingUrl': ?instance.infringingUrl,
      'createdAt': instance.createdAt.toIso8601String(),
      'decidedAt': ?instance.decidedAt?.toIso8601String(),
      'decisionNote': ?instance.decisionNote,
      'counterSubmittedAt': ?instance.counterSubmittedAt?.toIso8601String(),
      'canCounter': instance.canCounter,
    };
