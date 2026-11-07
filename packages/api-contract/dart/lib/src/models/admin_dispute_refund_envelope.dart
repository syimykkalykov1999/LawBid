// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_dispute_refund_dto.dart';
import 'response_meta_dto.dart';

part 'admin_dispute_refund_envelope.g.dart';

@JsonSerializable()
class AdminDisputeRefundEnvelope {
  const AdminDisputeRefundEnvelope({required this.data, this.meta});

  factory AdminDisputeRefundEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminDisputeRefundEnvelopeFromJson(json);

  final AdminDisputeRefundDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminDisputeRefundEnvelopeToJson(this);
}
