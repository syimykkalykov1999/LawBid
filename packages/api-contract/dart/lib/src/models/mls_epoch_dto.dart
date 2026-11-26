// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'mls_epoch_dto.g.dart';

@JsonSerializable()
class MlsEpochDto {
  const MlsEpochDto({required this.epoch});

  factory MlsEpochDto.fromJson(Map<String, Object?> json) =>
      _$MlsEpochDtoFromJson(json);

  /// The group’s epoch after the commit.
  final num epoch;

  Map<String, Object?> toJson() => _$MlsEpochDtoToJson(this);
}
