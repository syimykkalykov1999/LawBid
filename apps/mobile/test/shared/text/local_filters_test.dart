import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/shared/people/my_people.dart';

void main() {
  test('MyPerson.matches: any case, accents, word order, @handle', () {
    const p = MyPerson(
      id: '1',
      group: MyPeopleGroup.chats,
      name: 'José García',
      username: 'jgarcia_77',
    );
    expect(p.matches('JOSE'), isTrue);
    expect(p.matches('garcia jose'), isTrue);
    expect(p.matches('@jgarcia'), isTrue);
    expect(p.matches('xyz'), isFalse);
    expect(p.matches(''), isTrue);
  });
}
