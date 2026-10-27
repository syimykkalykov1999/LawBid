// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ad_rule_dto_severity.dart';

part 'ad_rule_dto.g.dart';

@JsonSerializable()
class AdRuleDto {
  const AdRuleDto({
    required this.id,
    required this.severity,
    required this.reference,
    required this.messageEn,
    required this.messageRu,
  });

  factory AdRuleDto.fromJson(Map<String, Object?> json) =>
      _$AdRuleDtoFromJson(json);

  final String id;
  final AdRuleDtoSeverity severity;
  final String reference;
  final String messageEn;
  final String messageRu;

  Map<String, Object?> toJson() => _$AdRuleDtoToJson(this);
}
