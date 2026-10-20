import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/groups/presentation/poll/poll_logic.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

api.PollDto _poll({
  bool multiple = false,
  List<String> mine = const [],
  List<int> votes = const [2, 1],
  int total = 3,
}) =>
    api.PollDto(
      id: 'p',
      question: 'q',
      multiple: multiple,
      anonymous: true,
      closed: false,
      creatorId: 'u',
      totalVoters: total,
      myOptionIds: mine,
      options: [
        for (var i = 0; i < votes.length; i++)
          api.PollOptionDto(
            id: 'o$i',
            text: 'T$i',
            votes: votes[i],
            percent: total > 0 ? (votes[i] / total * 100).round() : 0,
            voted: mine.contains('o$i'),
            recentVoters: const [],
          ),
      ],
    );

void main() {
  test('first vote adds a voter and recomputes percents', () {
    final p = pollWithVote(_poll(), {'o1'});
    expect(p.totalVoters, 4);
    expect(p.myOptionIds, ['o1']);
    expect(p.options[1].votes, 2);
    expect(p.options[1].percent, 50);
    expect(p.options[1].voted, isTrue);
  });

  test('revote moves the vote, total unchanged', () {
    final p = pollWithVote(_poll(mine: ['o0'], votes: [2, 1]), {'o1'});
    expect(p.totalVoters, 3);
    expect(p.options[0].votes, 1);
    expect(p.options[1].votes, 2);
  });

  test('retract removes the voter', () {
    final p = pollWithVote(_poll(mine: ['o0']), {});
    expect(p.totalVoters, 2);
    expect(p.options[0].votes, 1);
    expect(p.myOptionIds, isEmpty);
  });

  test('unknown option ids are ignored', () {
    expect(pollWithVote(_poll(), {'zzz'}).myOptionIds, isEmpty);
  });

  test('toggle and same selection', () {
    expect(pollToggle({'a'}, 'b', multiple: false), {'b'});
    expect(pollToggle({'a'}, 'b', multiple: true), {'a', 'b'});
    expect(pollToggle({'a', 'b'}, 'b', multiple: true), {'a'});
    expect(pollSameSelection(['a', 'b'], {'b', 'a'}), isTrue);
    expect(pollSameSelection(['a'], ['a', 'b']), isFalse);
  });

  test('results are shown after voting or when closed', () {
    expect(pollShowsResults(_poll()), isFalse);
    expect(pollShowsResults(_poll(mine: ['o0'])), isTrue);
    expect(pollShowsResults(pollAsClosed(_poll())), isTrue);
  });

  test('draft validation', () {
    expect(validatePollDraft('', ['a', 'b']), {PollIssue.questionEmpty});
    expect(validatePollDraft('q', ['a', ' ']), {PollIssue.tooFewOptions});
    expect(validatePollDraft('q', ['a', 'A']), {PollIssue.duplicateOptions});
    expect(validatePollDraft('q', ['a', 'b', '']), isEmpty);
    expect(cleanPollOptions([' a ', '', 'b']), ['a', 'b']);
  });
}
