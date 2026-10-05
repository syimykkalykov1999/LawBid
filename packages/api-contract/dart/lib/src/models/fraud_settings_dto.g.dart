// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'fraud_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FraudSettingsDto _$FraudSettingsDtoFromJson(Map<String, dynamic> json) =>
    FraudSettingsDto(
      enabled: json['enabled'] as bool,
      auto: json['auto'] as bool,
      matchAction: FraudMatchAction.fromJson(json['matchAction'] as String),
      deviceAction: FraudMatchAction.fromJson(json['deviceAction'] as String),
      reviewScore: json['reviewScore'] as num,
      restrictScore: json['restrictScore'] as num,
      banScore: json['banScore'] as num,
      weightFraudReport: json['weightFraudReport'] as num,
      weightReport: json['weightReport'] as num,
      weightChargeback: json['weightChargeback'] as num,
      windowDays: json['windowDays'] as num,
      notifyStaff: json['notifyStaff'] as bool,
      fingerprintRetentionDays: json['fingerprintRetentionDays'] as num,
      blockedRetentionDays: json['blockedRetentionDays'] as num,
    );

Map<String, dynamic> _$FraudSettingsDtoToJson(FraudSettingsDto instance) =>
    <String, dynamic>{
      'enabled': instance.enabled,
      'auto': instance.auto,
      'matchAction': instance.matchAction.toJson(),
      'deviceAction': instance.deviceAction.toJson(),
      'reviewScore': instance.reviewScore,
      'restrictScore': instance.restrictScore,
      'banScore': instance.banScore,
      'weightFraudReport': instance.weightFraudReport,
      'weightReport': instance.weightReport,
      'weightChargeback': instance.weightChargeback,
      'windowDays': instance.windowDays,
      'notifyStaff': instance.notifyStaff,
      'fingerprintRetentionDays': instance.fingerprintRetentionDays,
      'blockedRetentionDays': instance.blockedRetentionDays,
    };
