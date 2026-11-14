import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/platform/web_semantics.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  tearDown(WebSemantics.reset);

  test('not the website: nothing is turned on', () async {
    SharedPreferences.setMockInitialValues({});
    WebSemantics.start(await SharedPreferences.getInstance());
    expect(WebSemantics.isOn, isFalse);
  });

  test('website: on from the start, off and back on with the admin switch',
      () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    WebSemantics.forceWeb = true;
    WebSemantics.start(prefs);
    expect(WebSemantics.isOn, isTrue);
    expect(SemanticsBinding.instance.semanticsEnabled, isTrue);

    WebSemantics.apply(const {WebSemantics.configKey: 'false'});
    expect(WebSemantics.isOn, isFalse);
    expect(prefs.getBool('web_semantics_enabled'), isFalse);

    WebSemantics.apply(const {});
    expect(WebSemantics.isOn, isTrue);
    expect(prefs.getBool('web_semantics_enabled'), isTrue);
  });

  test('website: the next start follows the last admin answer', () async {
    SharedPreferences.setMockInitialValues({'web_semantics_enabled': false});
    WebSemantics.forceWeb = true;
    WebSemantics.start(await SharedPreferences.getInstance());
    expect(WebSemantics.isOn, isFalse);
  });
}
