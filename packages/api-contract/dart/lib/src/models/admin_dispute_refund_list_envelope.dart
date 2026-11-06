// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_dispute_refund_dto.dart';
import 'response_meta_dto.dart';

part 'admin_dispute_refund_list_envelope.g.dart';

@JsonSerializable()
class AdminDisputeRefundListEnvelope {
  const AdminDisputeRefundListEnvelope({required this.data, this.meta});

  factory AdminDisputeRefundListEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminDisputeRefundListEnvelopeFromJson(json);

  final List<AdminDisputeRefundDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminDisputeRefundListEnvelopeToJson(this);
}
