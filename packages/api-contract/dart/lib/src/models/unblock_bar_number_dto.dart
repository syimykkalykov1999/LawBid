// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'unblock_bar_number_dto.g.dart';

@JsonSerializable()
class UnblockBarNumberDto {
  const UnblockBarNumberDto({required this.reason});

  factory UnblockBarNumberDto.fromJson(Map<String, Object?> json) =>
      _$UnblockBarNumberDtoFromJson(json);

  /// Why the block is lifted (what the person explained / proved).
  final String reason;

  Map<String, Object?> toJson() => _$UnblockBarNumberDtoToJson(this);
}
