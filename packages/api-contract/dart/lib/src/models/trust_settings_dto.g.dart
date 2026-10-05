// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'trust_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TrustSettingsDto _$TrustSettingsDtoFromJson(Map<String, dynamic> json) =>
    TrustSettingsDto(
      minLevelBids: (json['minLevelBids'] as num).toInt(),
      minLevelPayments: (json['minLevelPayments'] as num).toInt(),
      minLevelBadge: (json['minLevelBadge'] as num).toInt(),
      payoutDelayDays: (json['payoutDelayDays'] as num).toInt(),
      payoutDelayUntilLevel: (json['payoutDelayUntilLevel'] as num).toInt(),
      autoHoldOnComplaint: json['autoHoldOnComplaint'] as bool,
      complaintsToSuspend: (json['complaintsToSuspend'] as num).toInt(),
      complaintWindowDays: (json['complaintWindowDays'] as num).toInt(),
      autoHoldOnNameMismatch: json['autoHoldOnNameMismatch'] as bool,
      flagDuplicateClaims: json['flagDuplicateClaims'] as bool,
    );

Map<String, dynamic> _$TrustSettingsDtoToJson(TrustSettingsDto instance) =>
    <String, dynamic>{
      'minLevelBids': instance.minLevelBids,
      'minLevelPayments': instance.minLevelPayments,
      'minLevelBadge': instance.minLevelBadge,
      'payoutDelayDays': instance.payoutDelayDays,
      'payoutDelayUntilLevel': instance.payoutDelayUntilLevel,
      'autoHoldOnComplaint': instance.autoHoldOnComplaint,
      'complaintsToSuspend': instance.complaintsToSuspend,
      'complaintWindowDays': instance.complaintWindowDays,
      'autoHoldOnNameMismatch': instance.autoHoldOnNameMismatch,
      'flagDuplicateClaims': instance.flagDuplicateClaims,
    };
