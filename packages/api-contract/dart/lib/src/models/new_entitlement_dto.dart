// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'new_entitlement_dto_audiences.dart';
import 'new_entitlement_dto_group.dart';
import 'new_entitlement_dto_type.dart';
import 'new_text_dto.dart';

part 'new_entitlement_dto.g.dart';

@JsonSerializable()
class NewEntitlementDto {
  const NewEntitlementDto({
    required this.key,
    required this.type,
    required this.audiences,
    required this.group,
    required this.label,
    required this.description,
    this.max,
    this.zeroIsUnlimited,
  });

  factory NewEntitlementDto.fromJson(Map<String, Object?> json) =>
      _$NewEntitlementDtoFromJson(json);

  /// a-z, 0-9, _; 3-40 characters; cannot be a built-in key
  final String key;
  final NewEntitlementDtoType type;
  final List<NewEntitlementDtoAudiences> audiences;
  final NewEntitlementDtoGroup group;
  final NewTextDto label;
  final NewTextDto description;
  final int? max;
  final bool? zeroIsUnlimited;

  Map<String, Object?> toJson() => _$NewEntitlementDtoToJson(this);
}
