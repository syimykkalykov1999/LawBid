// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'attach_agreement_dto.g.dart';

@JsonSerializable()
class AttachAgreementDto {
  const AttachAgreementDto({required this.fileId});

  factory AttachAgreementDto.fromJson(Map<String, Object?> json) =>
      _$AttachAgreementDtoFromJson(json);

  /// The attorney's own agreement PDF (an uploaded case_attachment file of the caller).
  final String fileId;

  Map<String, Object?> toJson() => _$AttachAgreementDtoToJson(this);
}
