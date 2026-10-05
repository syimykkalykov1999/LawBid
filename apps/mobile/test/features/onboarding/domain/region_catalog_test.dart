import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/auth/presentation/widgets/us_phone_input.dart';
import 'package:lawbid/features/onboarding/domain/us_states.dart';

void main() {
  tearDown(() => RegionCatalog.replace(const [RegionCatalog.us]));

  test('starts as the USA from the bundled list', () {
    expect(RegionCatalog.countries.single.code, 'US');
    expect(kRegions, kUsStates);
  });

  test('regions follow the switched-on countries', () {
    RegionCatalog.replace(const [
      RegionCatalog.us,
      CountryInfo(
        code: 'CA',
        name: 'Canada',
        callingCode: '1',
        regions: [UsState('ON', 'Ontario')],
      ),
    ]);
    expect(kRegions.length, kUsStates.length + 1);
    expect(RegionCatalog.regionName('ON'), 'Ontario');
    expect(RegionCatalog.country('CA')?.name, 'Canada');
  });

  test('an empty answer keeps the catalog', () {
    RegionCatalog.replace(const []);
    expect(RegionCatalog.countries.single.code, 'US');
  });

  test('phone numbers outside +1 are plain digits', () {
    expect(UsPhone.isValid('(202) 555-1234'), isTrue);
    expect(UsPhone.toE164('(202) 555-1234'), '+12025551234');
    expect(UsPhone.isValid('5512345678', callingCode: '52'), isTrue);
    expect(UsPhone.toE164('5512345678', callingCode: '52'), '+525512345678');
    expect(UsPhone.isValid('12', callingCode: '52'), isFalse);
  });
}
