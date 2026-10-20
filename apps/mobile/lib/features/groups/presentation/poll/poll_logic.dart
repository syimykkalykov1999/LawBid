import 'package:lawbid_api/lawbid_api.dart' as api;

/// Server limits of a poll (apps/api groups.dto.ts POLL_*).
const int kPollQuestionMax = 300;
const int kPollOptionMax = 100;
const int kPollOptionsMin = 2;
const int kPollOptionsMax = 10;

/// Whether the viewer sees the results: after voting, or once closed.
bool pollShowsResults(api.PollDto poll) =>
    poll.closed || poll.myOptionIds.isNotEmpty;

/// The selection after tapping [optionId]: single choice replaces it,
/// multiple choice toggles it.
Set<String> pollToggle(
  Set<String> current,
  String optionId, {
  required bool multiple,
}) {
  if (!multiple) return {optionId};
  final next = {...current};
  if (!next.remove(optionId)) next.add(optionId);
  return next;
}

/// Whether two selections hold the same option ids.
bool pollSameSelection(Iterable<String> a, Iterable<String> b) {
  final sa = a.toSet();
  final sb = b.toSet();
  return sa.length == sb.length && sa.containsAll(sb);
}

/// The poll as it will look once my vote is [selected] (optimistic UI):
/// my previous choices are taken back, the new ones counted, totals and
/// percents recomputed the way the server does (percent of all voters).
api.PollDto pollWithVote(api.PollDto poll, Set<String> selected) {
  final valid = poll.options.map((o) => o.id).toSet();
  final mine = selected.where(valid.contains).toSet();
  final before = poll.myOptionIds.toSet();
  final hadVoted = before.isNotEmpty;
  final hasVoted = mine.isNotEmpty;
  final total =
      (poll.totalVoters.toInt() + (hasVoted ? 1 : 0) - (hadVoted ? 1 : 0))
          .clamp(0, 1 << 30);
  final options = [
    for (final o in poll.options)
      () {
        final votes = (o.votes.toInt() -
                (before.contains(o.id) ? 1 : 0) +
                (mine.contains(o.id) ? 1 : 0))
            .clamp(0, 1 << 30);
        return api.PollOptionDto(
          id: o.id,
          text: o.text,
          votes: votes,
          percent: total > 0 ? (votes / total * 100).round() : 0,
          voted: mine.contains(o.id),
          recentVoters: o.recentVoters,
        );
      }(),
  ];
  return api.PollDto(
    id: poll.id,
    question: poll.question,
    multiple: poll.multiple,
    anonymous: poll.anonymous,
    closed: poll.closed,
    closedAt: poll.closedAt,
    creatorId: poll.creatorId,
    totalVoters: total,
    options: options,
    myOptionIds: [
      for (final o in poll.options)
        if (mine.contains(o.id)) o.id,
    ],
  );
}

/// The poll marked closed (used when the server answers POLL_CLOSED).
api.PollDto pollAsClosed(api.PollDto poll) => api.PollDto(
      id: poll.id,
      question: poll.question,
      multiple: poll.multiple,
      anonymous: poll.anonymous,
      closed: true,
      closedAt: poll.closedAt ?? DateTime.now(),
      creatorId: poll.creatorId,
      totalVoters: poll.totalVoters,
      options: poll.options,
      myOptionIds: poll.myOptionIds,
    );

/// A validation problem of the «new poll» form.
enum PollIssue { questionEmpty, tooFewOptions, duplicateOptions }

/// Checks a draft: non-empty question, at least [kPollOptionsMin] non-empty
/// options, all distinct (case-insensitive). Returns the problems found.
Set<PollIssue> validatePollDraft(String question, List<String> options) {
  final issues = <PollIssue>{};
  if (question.trim().isEmpty) issues.add(PollIssue.questionEmpty);
  final filled =
      options.map((o) => o.trim()).where((o) => o.isNotEmpty).toList();
  if (filled.length < kPollOptionsMin) issues.add(PollIssue.tooFewOptions);
  final seen = <String>{};
  for (final o in filled) {
    if (!seen.add(o.toLowerCase())) {
      issues.add(PollIssue.duplicateOptions);
      break;
    }
  }
  return issues;
}

/// The options to send: trimmed, empty ones dropped.
List<String> cleanPollOptions(List<String> options) => [
      for (final o in options)
        if (o.trim().isNotEmpty) o.trim(),
    ];
