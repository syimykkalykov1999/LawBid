import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/theme/app_theme_id.dart';
import 'package:lawbid/core/design_system/theme/app_theme_repository.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';

final appThemeRepositoryProvider = Provider<AppThemeRepository>(
  (ref) => LocalAppThemeRepository(ref.watch(localKvStoreProvider)),
);

/// The chosen theme; null until the user chooses (then Day / Night follow
/// the phone). Built synchronously from the saved value so the first frame
/// already has the right theme.
final appThemeControllerProvider =
    NotifierProvider<AppThemeController, AppThemeId?>(AppThemeController.new);

class AppThemeController extends Notifier<AppThemeId?> {
  @override
  AppThemeId? build() => ref.read(appThemeRepositoryProvider).read();

  Future<void> select(AppThemeId? id) async {
    state = id;
    await ref.read(appThemeRepositoryProvider).write(id);
  }
}
