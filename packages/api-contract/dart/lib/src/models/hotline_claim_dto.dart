// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'hotline_claim_dto.g.dart';

@JsonSerializable()
class HotlineClaimDto {
  const HotlineClaimDto({this.token});

  factory HotlineClaimDto.fromJson(Map<String, Object?> json) =>
      _$HotlineClaimDtoFromJson(json);

  /// The notice’s claimToken (push data / `hotline:notify`); omit when the client taps «Позвонить сейчас» in the app itself.
  final String? token;

  Map<String, Object?> toJson() => _$HotlineClaimDtoToJson(this);
}
