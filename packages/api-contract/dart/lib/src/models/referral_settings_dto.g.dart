// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'referral_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReferralSettingsDto _$ReferralSettingsDtoFromJson(
  Map<String, dynamic> json,
) => ReferralSettingsDto(
  enabled: json['enabled'] as bool,
  attorneyReferrerReward: ReferralRewardDto.fromJson(
    json['attorneyReferrerReward'] as Map<String, dynamic>,
  ),
  attorneyRefereeReward: ReferralRewardDto.fromJson(
    json['attorneyRefereeReward'] as Map<String, dynamic>,
  ),
  clientReferrerReward: ReferralRewardDto.fromJson(
    json['clientReferrerReward'] as Map<String, dynamic>,
  ),
  clientRefereeReward: ReferralRewardDto.fromJson(
    json['clientRefereeReward'] as Map<String, dynamic>,
  ),
  texts: ReferralTextsByLangDto.fromJson(json['texts'] as Map<String, dynamic>),
  applyWindowDays: (json['applyWindowDays'] as num?)?.toInt() ?? 14,
  maxInvitesPerReferrer: (json['maxInvitesPerReferrer'] as num?)?.toInt() ?? 0,
);

Map<String, dynamic> _$ReferralSettingsDtoToJson(
  ReferralSettingsDto instance,
) => <String, dynamic>{
  'enabled': instance.enabled,
  'attorneyReferrerReward': instance.attorneyReferrerReward.toJson(),
  'attorneyRefereeReward': instance.attorneyRefereeReward.toJson(),
  'clientReferrerReward': instance.clientReferrerReward.toJson(),
  'clientRefereeReward': instance.clientRefereeReward.toJson(),
  'applyWindowDays': instance.applyWindowDays,
  'maxInvitesPerReferrer': instance.maxInvitesPerReferrer,
  'texts': instance.texts.toJson(),
};
