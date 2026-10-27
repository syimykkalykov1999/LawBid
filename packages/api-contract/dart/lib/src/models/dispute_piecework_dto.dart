// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'dispute_piecework_dto.g.dart';

@JsonSerializable()
class DisputePieceworkDto {
  const DisputePieceworkDto({required this.reason});

  factory DisputePieceworkDto.fromJson(Map<String, Object?> json) =>
      _$DisputePieceworkDtoFromJson(json);

  final String reason;

  Map<String, Object?> toJson() => _$DisputePieceworkDtoToJson(this);
}
