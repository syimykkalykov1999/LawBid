// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'counter_offer_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CounterOfferDto _$CounterOfferDtoFromJson(Map<String, dynamic> json) =>
    CounterOfferDto(
      amountCents: (json['amountCents'] as num).toInt(),
      message: json['message'] as String?,
    );

Map<String, dynamic> _$CounterOfferDtoToJson(CounterOfferDto instance) =>
    <String, dynamic>{
      'amountCents': instance.amountCents,
      'message': ?instance.message,
    };
