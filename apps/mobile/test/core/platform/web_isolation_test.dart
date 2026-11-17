import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/platform/web_isolation.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late List<bool> told;

  setUp(() {
    told = [];
    WebIsolation.debugTellPage = ({required on}) => told.add(on);
  });
  tearDown(WebIsolation.reset);

  test('not the website: nothing is stored, the page is not told', () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    WebIsolation.start(prefs);
    WebIsolation.apply(const {WebIsolation.configKey: 'true'});
    expect(prefs.getBool('web_cross_origin_isolation'), isNull);
    expect(told, isEmpty);
  });

  test('website: the admin answer is kept for boot_head.js and told once',
      () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    WebIsolation.forceWeb = true;
    WebIsolation.start(prefs);

    WebIsolation.apply(const {WebIsolation.configKey: 'true'});
    expect(prefs.getBool('web_cross_origin_isolation'), isTrue);
    expect(told, [true]);

    // The same answer again (every bootstrap): nothing new to do.
    WebIsolation.apply(const {WebIsolation.configKey: 'true'});
    expect(told, [true]);

    WebIsolation.apply(const {WebIsolation.configKey: 'false'});
    expect(prefs.getBool('web_cross_origin_isolation'), isFalse);
    expect(told, [true, false]);
  });

  test('website: a missing key means off (default off)', () async {
    SharedPreferences.setMockInitialValues({
      'web_cross_origin_isolation': true,
    });
    final prefs = await SharedPreferences.getInstance();
    WebIsolation.forceWeb = true;
    WebIsolation.start(prefs);
    WebIsolation.apply(const {});
    expect(prefs.getBool('web_cross_origin_isolation'), isFalse);
    expect(told, [false]);
  });
}
