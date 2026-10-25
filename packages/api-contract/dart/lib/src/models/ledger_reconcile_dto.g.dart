// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ledger_reconcile_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LedgerReconcileDto _$LedgerReconcileDtoFromJson(Map<String, dynamic> json) =>
    LedgerReconcileDto(
      ranAt: json['ranAt'] as String,
      ok: json['ok'] as bool,
      entries: (json['entries'] as num).toInt(),
      unbalancedEntries: (json['unbalancedEntries'] as num).toInt(),
      missingPayments: (json['missingPayments'] as num).toInt(),
      missingCasePayments: (json['missingCasePayments'] as num).toInt(),
      caseRefundDriftCents: (json['caseRefundDriftCents'] as num).toInt(),
      stripeStatus: LedgerReconcileDtoStripeStatus.fromJson(
        json['stripeStatus'] as String,
      ),
      stripeDeltaCents: (json['stripeDeltaCents'] as num?)?.toInt(),
      problems: (json['problems'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$LedgerReconcileDtoToJson(LedgerReconcileDto instance) =>
    <String, dynamic>{
      'ranAt': instance.ranAt,
      'ok': instance.ok,
      'entries': instance.entries,
      'unbalancedEntries': instance.unbalancedEntries,
      'missingPayments': instance.missingPayments,
      'missingCasePayments': instance.missingCasePayments,
      'caseRefundDriftCents': instance.caseRefundDriftCents,
      'stripeStatus': instance.stripeStatus.toJson(),
      'stripeDeltaCents': ?instance.stripeDeltaCents,
      'problems': instance.problems,
    };
