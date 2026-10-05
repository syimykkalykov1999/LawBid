// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'entitlement_def_dto_audiences.dart';
import 'entitlement_def_dto_type.dart';
import 'entitlement_key.dart';
import 'localized_text_dto.dart';

part 'entitlement_def_dto.g.dart';

@JsonSerializable()
class EntitlementDefDto {
  const EntitlementDefDto({
    required this.key,
    required this.type,
    required this.audiences,
    required this.group,
    required this.label,
    required this.description,
    this.min,
    this.max,
    this.zeroIsUnlimited,
  });

  factory EntitlementDefDto.fromJson(Map<String, Object?> json) =>
      _$EntitlementDefDtoFromJson(json);

  final EntitlementKey key;
  final EntitlementDefDtoType type;
  final List<EntitlementDefDtoAudiences> audiences;
  final String group;
  final LocalizedTextDto label;
  final LocalizedTextDto description;
  final int? min;
  final int? max;
  final bool? zeroIsUnlimited;

  Map<String, Object?> toJson() => _$EntitlementDefDtoToJson(this);
}
