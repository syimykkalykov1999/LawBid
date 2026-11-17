// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'hotline_offer_state.dart';

part 'hotline_offer_result_dto.g.dart';

@JsonSerializable()
class HotlineOfferResultDto {
  const HotlineOfferResultDto({
    required this.ok,
    required this.state,
    this.callId,
  });

  factory HotlineOfferResultDto.fromJson(Map<String, Object?> json) =>
      _$HotlineOfferResultDtoFromJson(json);

  final bool ok;
  final HotlineOfferState state;

  /// The 1:1 voice call opened by «Взять» (GET /calls/:id, `call:signal`, GET /calls/ice-servers). Audio only, never recorded.
  final String? callId;

  Map<String, Object?> toJson() => _$HotlineOfferResultDtoToJson(this);
}
