// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'my_case_payments_summary_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MyCasePaymentsSummaryDto _$MyCasePaymentsSummaryDtoFromJson(
  Map<String, dynamic> json,
) => MyCasePaymentsSummaryDto(
  totalCents: (json['totalCents'] as num).toInt(),
  count: (json['count'] as num).toInt(),
  refundedCents: (json['refundedCents'] as num).toInt(),
);

Map<String, dynamic> _$MyCasePaymentsSummaryDtoToJson(
  MyCasePaymentsSummaryDto instance,
) => <String, dynamic>{
  'totalCents': instance.totalCents,
  'count': instance.count,
  'refundedCents': instance.refundedCents,
};
