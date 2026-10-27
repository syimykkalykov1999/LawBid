// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'flag_minor_dto.g.dart';

@JsonSerializable()
class FlagMinorDto {
  const FlagMinorDto({required this.reason});

  factory FlagMinorDto.fromJson(Map<String, Object?> json) =>
      _$FlagMinorDtoFromJson(json);

  /// Why the account is believed to be a minor.
  final String reason;

  Map<String, Object?> toJson() => _$FlagMinorDtoToJson(this);
}
