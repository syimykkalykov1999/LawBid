// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'promo_delete_outcome.dart';

part 'promo_delete_result_dto.g.dart';

@JsonSerializable()
class PromoDeleteResultDto {
  const PromoDeleteResultDto({required this.id, required this.outcome});

  factory PromoDeleteResultDto.fromJson(Map<String, Object?> json) =>
      _$PromoDeleteResultDtoFromJson(json);

  final String id;

  /// deleted: never used, removed for good (the code can be reused); archived: already used, hidden and switched off so payment history stays intact.
  final PromoDeleteOutcome outcome;

  Map<String, Object?> toJson() => _$PromoDeleteResultDtoToJson(this);
}
