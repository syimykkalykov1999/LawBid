// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'sign_deal_record_dto.g.dart';

@JsonSerializable()
class SignDealRecordDto {
  const SignDealRecordDto({required this.name, required this.imagePngBase64});

  factory SignDealRecordDto.fromJson(Map<String, Object?> json) =>
      _$SignDealRecordDtoFromJson(json);

  /// Full name as the signer wants it printed under the signature.
  final String name;

  /// The drawn signature: PNG with alpha, base64, ≤150 KB.
  final String imagePngBase64;

  Map<String, Object?> toJson() => _$SignDealRecordDtoToJson(this);
}
