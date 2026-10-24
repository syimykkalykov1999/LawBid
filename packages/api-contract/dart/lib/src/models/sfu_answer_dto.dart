// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'sfu_answer_dto.g.dart';

@JsonSerializable()
class SfuAnswerDto {
  const SfuAnswerDto({required this.sdp});

  factory SfuAnswerDto.fromJson(Map<String, Object?> json) =>
      _$SfuAnswerDtoFromJson(json);

  /// Your SDP answer to the SFU offer.
  final String sdp;

  Map<String, Object?> toJson() => _$SfuAnswerDtoToJson(this);
}
