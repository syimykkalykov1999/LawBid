// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_payment_dto.dart';
import 'response_meta_dto.dart';

part 'case_payment_list_envelope.g.dart';

@JsonSerializable()
class CasePaymentListEnvelope {
  const CasePaymentListEnvelope({required this.data, this.meta});

  factory CasePaymentListEnvelope.fromJson(Map<String, Object?> json) =>
      _$CasePaymentListEnvelopeFromJson(json);

  final List<CasePaymentDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CasePaymentListEnvelopeToJson(this);
}
