// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stars_overview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StarsOverviewDto _$StarsOverviewDtoFromJson(Map<String, dynamic> json) =>
    StarsOverviewDto(
      enabled: json['enabled'] as bool,
      balance: (json['balance'] as num).toInt(),
      packs: (json['packs'] as List<dynamic>)
          .map((e) => StarPackDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      giftConvertPercent: (json['giftConvertPercent'] as num).toInt(),
    );

Map<String, dynamic> _$StarsOverviewDtoToJson(StarsOverviewDto instance) =>
    <String, dynamic>{
      'enabled': instance.enabled,
      'balance': instance.balance,
      'packs': instance.packs.map((e) => e.toJson()).toList(),
      'giftConvertPercent': instance.giftConvertPercent,
    };
