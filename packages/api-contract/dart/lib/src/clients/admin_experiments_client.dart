// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/create_experiment_dto.dart';
import '../models/experiment_envelope.dart';
import '../models/experiment_list_envelope.dart';
import '../models/start_experiment_dto.dart';
import '../models/stop_experiment_dto.dart';

part 'admin_experiments_client.g.dart';

@RestApi()
abstract class AdminExperimentsClient {
  factory AdminExperimentsClient(Dio dio, {String? baseUrl}) =
      _AdminExperimentsClient;

  /// Experiments with their latest report
  @GET('/admin/experiments')
  Future<ExperimentListEnvelope> listExperiments({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Create an experiment (draft: changes nothing yet)
  @POST('/admin/experiments')
  Future<ExperimentEnvelope> createExperiment({
    @Body() required CreateExperimentDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Start a draft at a small share of users (2FA)
  @POST('/admin/experiments/{id}/start')
  Future<ExperimentEnvelope> startExperiment({
    @Path('id') required String id,
    @Body() required StartExperimentDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Raise the share of a running experiment (2FA)
  @POST('/admin/experiments/{id}/traffic')
  Future<ExperimentEnvelope> setExperimentTraffic({
    @Path('id') required String id,
    @Body() required StartExperimentDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Stop = roll back to the default behaviour (2FA)
  @POST('/admin/experiments/{id}/stop')
  Future<ExperimentEnvelope> stopExperiment({
    @Path('id') required String id,
    @Body() required StopExperimentDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Recompute the report now
  @POST('/admin/experiments/{id}/refresh')
  Future<ExperimentEnvelope> refreshReport({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
