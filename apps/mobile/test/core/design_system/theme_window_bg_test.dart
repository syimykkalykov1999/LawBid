import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/theme/app_theme_id.dart';
import 'package:lawbid/core/design_system/theme/app_theme_repository.dart';
import 'package:lawbid/core/persistence/local_kv_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// R-112: the native window behind Flutter takes its colour from this key.
void main() {
  late LocalAppThemeRepository repo;
  late LocalKvStore kv;

  Future<void> setUpPrefs(Map<String, Object> initial) async {
    SharedPreferences.setMockInitialValues(initial);
    kv = LocalKvStore(await SharedPreferences.getInstance());
    repo = LocalAppThemeRepository(kv);
  }

  test('every theme writes its own background as #AARRGGBB on select',
      () async {
    await setUpPrefs({});
    for (final spec in AppThemes.all) {
      await repo.write(spec.id);
      final wire = kv.getString(kWindowBgKey)!;
      expect(wire, matches(RegExp(r'^#[0-9A-F]{8}$')));
      expect(wire, windowBgWire(spec.tokens().bg));
    }
  });

  test('blue is #FF003B70', () async {
    await setUpPrefs({});
    await repo.write(AppThemeId.blue);
    expect(kv.getString(kWindowBgKey), '#FF003B70');
  });

  test('clearing the theme clears the colour', () async {
    await setUpPrefs({});
    await repo.write(AppThemeId.night);
    await repo.write(null);
    expect(kv.getString(kWindowBgKey), isNull);
  });

  test('a theme saved before the key existed gets the colour on read',
      () async {
    await setUpPrefs({'design_system.theme_mode': 'green'});
    expect(repo.read(), AppThemeId.green);
    await Future<void>.delayed(Duration.zero);
    expect(kv.getString(kWindowBgKey), '#FF007200');
  });
}
