// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'entitlement_def_dto.dart';
import 'localized_text_dto.dart';

part 'new_entitlement_result_dto.g.dart';

@JsonSerializable()
class NewEntitlementResultDto {
  const NewEntitlementResultDto({
    required this.entitlement,
    required this.privateNote,
  });

  factory NewEntitlementResultDto.fromJson(Map<String, Object?> json) =>
      _$NewEntitlementResultDtoFromJson(json);

  final EntitlementDefDto entitlement;
  @JsonKey(name: '_note')
  final LocalizedTextDto privateNote;

  Map<String, Object?> toJson() => _$NewEntitlementResultDtoToJson(this);
}
