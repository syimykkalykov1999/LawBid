// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_case_payment_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateCasePaymentDto _$CreateCasePaymentDtoFromJson(
  Map<String, dynamic> json,
) => CreateCasePaymentDto(
  kind: CasePaymentKind.fromJson(json['kind'] as String),
  amountCents: (json['amountCents'] as num?)?.toInt(),
  note: json['note'] as String?,
  requestId: json['requestId'] as String?,
);

Map<String, dynamic> _$CreateCasePaymentDtoToJson(
  CreateCasePaymentDto instance,
) => <String, dynamic>{
  'kind': instance.kind.toJson(),
  'amountCents': ?instance.amountCents,
  'note': ?instance.note,
  'requestId': ?instance.requestId,
};
