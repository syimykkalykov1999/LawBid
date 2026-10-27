// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ad_rule_dto.dart';
import 'response_meta_dto.dart';

part 'ad_rule_list_envelope.g.dart';

@JsonSerializable()
class AdRuleListEnvelope {
  const AdRuleListEnvelope({required this.data, this.meta});

  factory AdRuleListEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdRuleListEnvelopeFromJson(json);

  final List<AdRuleDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdRuleListEnvelopeToJson(this);
}
