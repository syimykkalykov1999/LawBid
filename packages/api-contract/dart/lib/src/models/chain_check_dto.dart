// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'chain_check_dto.g.dart';

@JsonSerializable()
class ChainCheckDto {
  const ChainCheckDto({
    required this.checked,
    required this.brokenAtSeq,
    required this.headHash,
    required this.headSeq,
  });

  factory ChainCheckDto.fromJson(Map<String, Object?> json) =>
      _$ChainCheckDtoFromJson(json);

  final num checked;
  final num? brokenAtSeq;
  final String? headHash;
  final num? headSeq;

  Map<String, Object?> toJson() => _$ChainCheckDtoToJson(this);
}
