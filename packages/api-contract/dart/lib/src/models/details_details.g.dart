// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'details_details.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DetailsDetails _$DetailsDetailsFromJson(Map<String, dynamic> json) =>
    DetailsDetails(
      status: TerminusHealthIndicatorResultStatus.fromJson(
        json['status'] as String,
      ),
      responseTime: json['responseTime'] as num?,
      cachedResponse: json['cachedResponse'] as bool?,
    );

Map<String, dynamic> _$DetailsDetailsToJson(DetailsDetails instance) =>
    <String, dynamic>{
      'status': instance.status.toJson(),
      'responseTime': ?instance.responseTime,
      'cachedResponse': ?instance.cachedResponse,
    };
