import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../persistence/persistence_providers.dart';
import 'local_theme_mode_repository.dart';
import 'theme_mode_repository.dart';

part 'theme_mode_providers.g.dart';

/// Swappable per docs/CHANGELOG.md stage 1.5: stage 1.7 overrides this with a
/// composite local+server repository implementing the same [ThemeModeRepository]
/// interface, once real auth/session state exists to sync against.
final themeModeRepositoryProvider = Provider<ThemeModeRepository>(
  (ref) => LocalThemeModeRepository(ref.watch(localKvStoreProvider)),
);

@riverpod
class ThemeModeController extends _$ThemeModeController {
  @override
  Future<ThemeMode> build() => ref.read(themeModeRepositoryProvider).read();

  Future<void> setThemeMode(ThemeMode mode) async {
    state = AsyncData(mode);
    await ref.read(themeModeRepositoryProvider).write(mode);
  }
}
