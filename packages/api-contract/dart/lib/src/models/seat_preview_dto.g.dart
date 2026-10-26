// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'seat_preview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SeatPreviewDto _$SeatPreviewDtoFromJson(Map<String, dynamic> json) =>
    SeatPreviewDto(
      seats: (json['seats'] as num).toInt(),
      currentSeats: (json['currentSeats'] as num).toInt(),
      amountNowCents: (json['amountNowCents'] as num).toInt(),
      currency: json['currency'] as String,
      prorationDate: (json['prorationDate'] as num).toInt(),
      periodEnd: json['periodEnd'] == null
          ? null
          : DateTime.parse(json['periodEnd'] as String),
      seatCents: (json['seatCents'] as num).toInt(),
      monthlyIncreaseCents: (json['monthlyIncreaseCents'] as num).toInt(),
      nextChargeCents: (json['nextChargeCents'] as num).toInt(),
      taxCents: (json['taxCents'] as num?)?.toInt(),
    );

Map<String, dynamic> _$SeatPreviewDtoToJson(SeatPreviewDto instance) =>
    <String, dynamic>{
      'seats': instance.seats,
      'currentSeats': instance.currentSeats,
      'amountNowCents': instance.amountNowCents,
      'taxCents': ?instance.taxCents,
      'currency': instance.currency,
      'prorationDate': instance.prorationDate,
      'periodEnd': ?instance.periodEnd?.toIso8601String(),
      'seatCents': instance.seatCents,
      'monthlyIncreaseCents': instance.monthlyIncreaseCents,
      'nextChargeCents': instance.nextChargeCents,
    };
