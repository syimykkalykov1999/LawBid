// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'trust_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TrustSettingsDto _$TrustSettingsDtoFromJson(Map<String, dynamic> json) =>
    TrustSettingsDto(
      enabled: json['enabled'] as bool,
      manualReview: json['manualReview'] as bool,
      requireRegistry: json['requireRegistry'] as bool,
      requireIdentity: json['requireIdentity'] as bool,
      requireDocuments: json['requireDocuments'] as bool,
      bidsRequireCleared: json['bidsRequireCleared'] as bool,
      payoutDelayDays: (json['payoutDelayDays'] as num).toInt(),
      autoHoldOnComplaint: json['autoHoldOnComplaint'] as bool,
      complaintsToSuspend: (json['complaintsToSuspend'] as num).toInt(),
      complaintWindowDays: (json['complaintWindowDays'] as num).toInt(),
      autoHoldOnNameMismatch: json['autoHoldOnNameMismatch'] as bool,
      flagDuplicateClaims: json['flagDuplicateClaims'] as bool,
      firmLinkAutoRegistry: json['firmLinkAutoRegistry'] as bool,
      firmLinkAutoEmail: json['firmLinkAutoEmail'] as bool,
      blockOnReject: json['blockOnReject'] as bool,
      blockContacts: json['blockContacts'] as bool,
    );

Map<String, dynamic> _$TrustSettingsDtoToJson(TrustSettingsDto instance) =>
    <String, dynamic>{
      'enabled': instance.enabled,
      'manualReview': instance.manualReview,
      'requireRegistry': instance.requireRegistry,
      'requireIdentity': instance.requireIdentity,
      'requireDocuments': instance.requireDocuments,
      'bidsRequireCleared': instance.bidsRequireCleared,
      'payoutDelayDays': instance.payoutDelayDays,
      'autoHoldOnComplaint': instance.autoHoldOnComplaint,
      'complaintsToSuspend': instance.complaintsToSuspend,
      'complaintWindowDays': instance.complaintWindowDays,
      'autoHoldOnNameMismatch': instance.autoHoldOnNameMismatch,
      'flagDuplicateClaims': instance.flagDuplicateClaims,
      'firmLinkAutoRegistry': instance.firmLinkAutoRegistry,
      'firmLinkAutoEmail': instance.firmLinkAutoEmail,
      'blockOnReject': instance.blockOnReject,
      'blockContacts': instance.blockContacts,
    };
