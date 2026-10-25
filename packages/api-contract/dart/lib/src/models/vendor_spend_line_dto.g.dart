// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'vendor_spend_line_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VendorSpendLineDto _$VendorSpendLineDtoFromJson(Map<String, dynamic> json) =>
    VendorSpendLineDto(
      label: json['label'] as String,
      usd: json['usd'] as num,
      note: json['note'] as String?,
    );

Map<String, dynamic> _$VendorSpendLineDtoToJson(VendorSpendLineDto instance) =>
    <String, dynamic>{
      'label': instance.label,
      'usd': instance.usd,
      'note': ?instance.note,
    };
