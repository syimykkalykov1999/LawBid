// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'partner_totals_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PartnerTotalsDto _$PartnerTotalsDtoFromJson(Map<String, dynamic> json) =>
    PartnerTotalsDto(
      heldCents: (json['heldCents'] as num).toInt(),
      approvedCents: (json['approvedCents'] as num).toInt(),
      paidCents: (json['paidCents'] as num).toInt(),
      thisMonthCents: (json['thisMonthCents'] as num).toInt(),
      referredCount: (json['referredCount'] as num).toInt(),
      qualifiedCount: (json['qualifiedCount'] as num).toInt(),
    );

Map<String, dynamic> _$PartnerTotalsDtoToJson(PartnerTotalsDto instance) =>
    <String, dynamic>{
      'heldCents': instance.heldCents,
      'approvedCents': instance.approvedCents,
      'paidCents': instance.paidCents,
      'thisMonthCents': instance.thisMonthCents,
      'referredCount': instance.referredCount,
      'qualifiedCount': instance.qualifiedCount,
    };
