// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_payout_account_row_dto.dart';
import 'response_meta_dto.dart';

part 'admin_payout_account_row_list_envelope.g.dart';

@JsonSerializable()
class AdminPayoutAccountRowListEnvelope {
  const AdminPayoutAccountRowListEnvelope({required this.data, this.meta});

  factory AdminPayoutAccountRowListEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$AdminPayoutAccountRowListEnvelopeFromJson(json);

  final List<AdminPayoutAccountRowDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$AdminPayoutAccountRowListEnvelopeToJson(this);
}
