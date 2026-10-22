import 'package:lawbid/shared/people/my_people.dart';

/// Owner 2026-10-22: the call's «Add participant» panel in the overflow
/// tests — every group, long names and @usernames, someone already in the
/// call (u1) and someone without a name.
List<MyPerson> longPeople() => [
      for (final (i, g) in MyPeopleGroup.values.indexed) ...[
        MyPerson(
          id: 'p${g.name}',
          group: g,
          name: 'Participant With A Very Long Name Number $i',
          username: 'a_really_long_username_number_$i',
        ),
        MyPerson(
          id: 'q${g.name}',
          group: g,
          username: 'only_a_username_$i',
        ),
      ],
      const MyPerson(
        id: 'u1',
        group: MyPeopleGroup.chats,
        name: 'Already In The Call With A Long Name',
        username: 'in_call',
      ),
    ];
