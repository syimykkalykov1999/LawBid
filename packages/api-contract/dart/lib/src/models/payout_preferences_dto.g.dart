// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payout_preferences_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PayoutPreferencesDto _$PayoutPreferencesDtoFromJson(
  Map<String, dynamic> json,
) => PayoutPreferencesDto(
  processingFeePayer: ProcessingFeePayer.fromJson(
    json['processingFeePayer'] as String,
  ),
);

Map<String, dynamic> _$PayoutPreferencesDtoToJson(
  PayoutPreferencesDto instance,
) => <String, dynamic>{
  'processingFeePayer': instance.processingFeePayer.toJson(),
};
