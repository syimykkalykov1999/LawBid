import 'package:lawbid/shared/people/my_people.dart';

/// The «Chats» tab's people, fixed (no server, no saved copy).
class FixedChatPeople extends MyChatPeople {
  FixedChatPeople(this.people);

  final List<MyPerson> people;

  @override
  Future<List<MyPerson>> build() async => people;

  @override
  Future<void> refreshIfStale() async {}

  @override
  Future<void> sync() async {}
}
