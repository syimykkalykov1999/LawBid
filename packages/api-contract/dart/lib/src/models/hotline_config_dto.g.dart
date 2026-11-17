// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_config_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineConfigDto _$HotlineConfigDtoFromJson(Map<String, dynamic> json) =>
    HotlineConfigDto(
      enabled: json['enabled'] as bool,
      heartbeatSec: json['heartbeatSec'] as num,
      offerTimeoutSec: json['offerTimeoutSec'] as num,
      maxLanguages: json['maxLanguages'] as num,
      topicMaxChars: json['topicMaxChars'] as num,
      countersIntervalSec: json['countersIntervalSec'] as num,
      notifyClaimSec: json['notifyClaimSec'] as num,
      reviewEnabled: json['reviewEnabled'] as bool,
      clientStepsEnabled: json['clientStepsEnabled'] as bool,
      disclosure: HotlineDisclosureDto.fromJson(
        json['disclosure'] as Map<String, dynamic>,
      ),
    );

Map<String, dynamic> _$HotlineConfigDtoToJson(HotlineConfigDto instance) =>
    <String, dynamic>{
      'enabled': instance.enabled,
      'heartbeatSec': instance.heartbeatSec,
      'offerTimeoutSec': instance.offerTimeoutSec,
      'maxLanguages': instance.maxLanguages,
      'topicMaxChars': instance.topicMaxChars,
      'countersIntervalSec': instance.countersIntervalSec,
      'notifyClaimSec': instance.notifyClaimSec,
      'reviewEnabled': instance.reviewEnabled,
      'clientStepsEnabled': instance.clientStepsEnabled,
      'disclosure': instance.disclosure.toJson(),
    };
