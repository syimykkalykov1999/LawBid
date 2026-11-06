import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/verification/domain/verification_models.dart';

void main() {
  test('owner 2026-11-05: the server item "photo" is understood', () {
    expect(MissingItem.parse('photo'), isA<MissingPhoto>());
  });
}
