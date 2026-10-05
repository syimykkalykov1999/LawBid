// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_payment_kind.dart';

part 'create_case_payment_dto.g.dart';

@JsonSerializable()
class CreateCasePaymentDto {
  const CreateCasePaymentDto({
    required this.kind,
    this.amountCents,
    this.note,
    this.requestId,
  });

  factory CreateCasePaymentDto.fromJson(Map<String, Object?> json) =>
      _$CreateCasePaymentDtoFromJson(json);

  /// bid = the whole accepted bid; balance = what is left of it; deposit / custom = amountCents.
  final CasePaymentKind kind;

  /// Required for deposit and custom.
  final int? amountCents;
  final String? note;

  /// Required for kind = invoice: the open payment request.
  final String? requestId;

  Map<String, Object?> toJson() => _$CreateCasePaymentDtoToJson(this);
}
