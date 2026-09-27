import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/config/run_app.dart';

/// Entry point of the staging flavor (see core/config/run_app.dart):
/// `flutter run --flavor staging -t lib/main_staging.dart --dart-define-from-file=config/staging.json`
Future<void> main() => runLawBid(AppFlavor.staging);
