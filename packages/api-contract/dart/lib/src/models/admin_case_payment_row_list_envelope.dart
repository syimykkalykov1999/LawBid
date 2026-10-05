// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_case_payment_row_dto.dart';
import 'response_meta_dto.dart';

part 'admin_case_payment_row_list_envelope.g.dart';

@JsonSerializable()
class AdminCasePaymentRowListEnvelope {
  const AdminCasePaymentRowListEnvelope({required this.data, this.meta});

  factory AdminCasePaymentRowListEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminCasePaymentRowListEnvelopeFromJson(json);

  final List<AdminCasePaymentRowDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$AdminCasePaymentRowListEnvelopeToJson(this);
}
