// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'create_case_payment_result_dto.dart';
import 'response_meta_dto.dart';

part 'create_case_payment_result_envelope.g.dart';

@JsonSerializable()
class CreateCasePaymentResultEnvelope {
  const CreateCasePaymentResultEnvelope({required this.data, this.meta});

  factory CreateCasePaymentResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$CreateCasePaymentResultEnvelopeFromJson(json);

  final CreateCasePaymentResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$CreateCasePaymentResultEnvelopeToJson(this);
}
