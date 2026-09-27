import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/config/run_app.dart';

/// Entry point of the dev flavor (see core/config/run_app.dart):
/// `flutter run --flavor dev -t lib/main_dev.dart --dart-define-from-file=config/dev.json`
Future<void> main() => runLawBid(AppFlavor.dev);
