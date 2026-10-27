// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'transparency_report_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TransparencyReportDto _$TransparencyReportDtoFromJson(
  Map<String, dynamic> json,
) => TransparencyReportDto(
  year: json['year'] as num,
  total: json['total'] as num,
  byType: Map<String, num>.from(json['byType'] as Map),
  byStatus: Map<String, num>.from(json['byStatus'] as Map),
  byCountry: Map<String, num>.from(json['byCountry'] as Map),
  accountsAffected: json['accountsAffected'] as num,
  withGagOrder: json['withGagOrder'] as num,
  usersNotified: json['usersNotified'] as num,
  holdsPlaced: json['holdsPlaced'] as num,
  productionsMade: json['productionsMade'] as num,
);

Map<String, dynamic> _$TransparencyReportDtoToJson(
  TransparencyReportDto instance,
) => <String, dynamic>{
  'year': instance.year,
  'total': instance.total,
  'byType': instance.byType,
  'byStatus': instance.byStatus,
  'byCountry': instance.byCountry,
  'accountsAffected': instance.accountsAffected,
  'withGagOrder': instance.withGagOrder,
  'usersNotified': instance.usersNotified,
  'holdsPlaced': instance.holdsPlaced,
  'productionsMade': instance.productionsMade,
};
