// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'bid_case_change_dto.dart';
import 'response_meta_dto.dart';

part 'bid_case_change_list_envelope.g.dart';

@JsonSerializable()
class BidCaseChangeListEnvelope {
  const BidCaseChangeListEnvelope({required this.data, this.meta});

  factory BidCaseChangeListEnvelope.fromJson(Map<String, Object?> json) =>
      _$BidCaseChangeListEnvelopeFromJson(json);

  final List<BidCaseChangeDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$BidCaseChangeListEnvelopeToJson(this);
}
