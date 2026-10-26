// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_payment_dto.dart';
import 'response_meta_dto.dart';

part 'admin_payment_list_envelope.g.dart';

@JsonSerializable()
class AdminPaymentListEnvelope {
  const AdminPaymentListEnvelope({required this.data, this.meta});

  factory AdminPaymentListEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminPaymentListEnvelopeFromJson(json);

  final List<AdminPaymentDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminPaymentListEnvelopeToJson(this);
}
