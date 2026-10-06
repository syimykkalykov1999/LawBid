// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_dmca_notice_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateDmcaNoticeDto _$CreateDmcaNoticeDtoFromJson(Map<String, dynamic> json) =>
    CreateDmcaNoticeDto(
      complainantName: json['complainantName'] as String,
      complainantEmail: json['complainantEmail'] as String,
      complainantAddress: json['complainantAddress'] as String,
      workDescription: json['workDescription'] as String,
      goodFaith: json['goodFaith'] as bool,
      accuracySworn: json['accuracySworn'] as bool,
      signature: json['signature'] as String,
      targetType: json['targetType'] == null
          ? null
          : DmcaTargetType.fromJson(json['targetType'] as String),
      targetId: json['targetId'] as String?,
      infringingUrl: json['infringingUrl'] as String?,
      complainantPhone: json['complainantPhone'] as String?,
    );

Map<String, dynamic> _$CreateDmcaNoticeDtoToJson(
  CreateDmcaNoticeDto instance,
) => <String, dynamic>{
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
};
