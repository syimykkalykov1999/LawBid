// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'block_bar_number_dto.g.dart';

@JsonSerializable()
class BlockBarNumberDto {
  const BlockBarNumberDto({
    required this.stateCode,
    required this.barNumber,
    required this.reason,
    this.blockContacts,
  });

  factory BlockBarNumberDto.fromJson(Map<String, Object?> json) =>
      _$BlockBarNumberDtoFromJson(json);

  final String stateCode;
  final String barNumber;
  final String reason;

  /// Also block the e-mail / phone of the current holder.
  final bool? blockContacts;

  Map<String, Object?> toJson() => _$BlockBarNumberDtoToJson(this);
}
