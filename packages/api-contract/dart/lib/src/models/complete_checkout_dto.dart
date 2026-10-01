// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'complete_checkout_dto.g.dart';

@JsonSerializable()
class CompleteCheckoutDto {
  const CompleteCheckoutDto({required this.sessionId});

  factory CompleteCheckoutDto.fromJson(Map<String, Object?> json) =>
      _$CompleteCheckoutDtoFromJson(json);

  final String sessionId;

  Map<String, Object?> toJson() => _$CompleteCheckoutDtoToJson(this);
}
