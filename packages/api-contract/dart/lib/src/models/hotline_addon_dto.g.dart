// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_addon_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineAddonDto _$HotlineAddonDtoFromJson(Map<String, dynamic> json) =>
    HotlineAddonDto(
      priceCents: (json['priceCents'] as num).toInt(),
      currency: json['currency'] as String,
      active: json['active'] as bool,
      renews: json['renews'] as bool,
      endsAt: json['endsAt'] == null
          ? null
          : DateTime.parse(json['endsAt'] as String),
      pending: json['pending'] as bool,
      canBuy: json['canBuy'] as bool,
    );

Map<String, dynamic> _$HotlineAddonDtoToJson(HotlineAddonDto instance) =>
    <String, dynamic>{
      'priceCents': instance.priceCents,
      'currency': instance.currency,
      'active': instance.active,
      'renews': instance.renews,
      'endsAt': ?instance.endsAt?.toIso8601String(),
      'pending': instance.pending,
      'canBuy': instance.canBuy,
    };
