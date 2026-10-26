// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_case_payment_stats_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminCasePaymentStatsDto _$AdminCasePaymentStatsDtoFromJson(
  Map<String, dynamic> json,
) => AdminCasePaymentStatsDto(
  volume30dCents: (json['volume30dCents'] as num).toInt(),
  count30d: (json['count30d'] as num).toInt(),
  platformFees30dCents: (json['platformFees30dCents'] as num).toInt(),
  refunded30dCents: (json['refunded30dCents'] as num).toInt(),
  disputedOpen: (json['disputedOpen'] as num).toInt(),
  pendingPayments: (json['pendingPayments'] as num).toInt(),
  payoutAccountsActive: (json['payoutAccountsActive'] as num).toInt(),
  payoutAccountsPending: (json['payoutAccountsPending'] as num).toInt(),
  volumeAllCents: (json['volumeAllCents'] as num).toInt(),
  platformFeesAllCents: (json['platformFeesAllCents'] as num).toInt(),
  openRequests: (json['openRequests'] as num).toInt(),
  openRequestsCents: (json['openRequestsCents'] as num).toInt(),
  overdueRequests: (json['overdueRequests'] as num).toInt(),
);

Map<String, dynamic> _$AdminCasePaymentStatsDtoToJson(
  AdminCasePaymentStatsDto instance,
) => <String, dynamic>{
  'volume30dCents': instance.volume30dCents,
  'count30d': instance.count30d,
  'platformFees30dCents': instance.platformFees30dCents,
  'refunded30dCents': instance.refunded30dCents,
  'disputedOpen': instance.disputedOpen,
  'pendingPayments': instance.pendingPayments,
  'payoutAccountsActive': instance.payoutAccountsActive,
  'payoutAccountsPending': instance.payoutAccountsPending,
  'volumeAllCents': instance.volumeAllCents,
  'platformFeesAllCents': instance.platformFeesAllCents,
  'openRequests': instance.openRequests,
  'openRequestsCents': instance.openRequestsCents,
  'overdueRequests': instance.overdueRequests,
};
