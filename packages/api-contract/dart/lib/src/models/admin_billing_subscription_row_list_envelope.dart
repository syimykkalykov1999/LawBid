// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_billing_subscription_row_dto.dart';
import 'response_meta_dto.dart';

part 'admin_billing_subscription_row_list_envelope.g.dart';

@JsonSerializable()
class AdminBillingSubscriptionRowListEnvelope {
  const AdminBillingSubscriptionRowListEnvelope({
    required this.data,
    this.meta,
  });

  factory AdminBillingSubscriptionRowListEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$AdminBillingSubscriptionRowListEnvelopeFromJson(json);

  final List<AdminBillingSubscriptionRowDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$AdminBillingSubscriptionRowListEnvelopeToJson(this);
}
