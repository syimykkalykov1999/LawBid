import 'package:lawbid/features/team/domain/team_models.dart';

/// Owner 2026-10-01: each kind of task asks for what it needs — a call
/// asks whom and which number, an email whom and which address, a visit
/// where to go… Text keys are `tasks.f.<key>`.
class TaskKindForm {
  const TaskKindForm({
    required this.title,
    this.when = 'when',
    this.where,
    this.contact,
    this.phone = false,
    this.email = false,
    this.caseLink = true,
    this.notes = 'notes',
    this.files = true,
  });

  /// Label / hint pair key for the title (`tasks.f.<title>` and `…Hint`).
  final String title;
  final String when;

  /// Null hides the field.
  final String? where;
  final String? contact;
  final bool phone;
  final bool email;
  final bool caseLink;
  final String notes;
  final bool files;

  // ignore: prefer_constructors_over_static_methods
  static TaskKindForm of(TaskKind k) => switch (k) {
        TaskKind.call => const TaskKindForm(
            title: 'callTitle',
            when: 'callWhen',
            contact: 'callWho',
            phone: true,
            notes: 'callNotes',
            files: false,
          ),
        TaskKind.email => const TaskKindForm(
            title: 'emailTitle',
            when: 'byWhen',
            contact: 'emailWho',
            email: true,
            notes: 'emailNotes',
          ),
        TaskKind.meeting => const TaskKindForm(
            title: 'meetingTitle',
            where: 'meetingWhere',
            contact: 'meetingWho',
            phone: true,
            notes: 'agenda',
          ),
        TaskKind.consultation => const TaskKindForm(
            title: 'consultTitle',
            where: 'consultWhere',
            contact: 'client',
            phone: true,
            email: true,
            notes: 'clientQuestion',
          ),
        TaskKind.court => const TaskKindForm(
            title: 'courtTitle',
            when: 'hearingWhen',
            where: 'courtWhere',
            notes: 'toPrepare',
          ),
        TaskKind.hearingPrep => const TaskKindForm(
            title: 'prepTitle',
            when: 'hearingWhen',
            notes: 'toPrepare',
          ),
        TaskKind.deposition => const TaskKindForm(
            title: 'depoTitle',
            where: 'place',
            contact: 'deponent',
            phone: true,
            notes: 'questions',
          ),
        TaskKind.mediation => const TaskKindForm(
            title: 'mediationTitle',
            where: 'place',
            contact: 'mediator',
            phone: true,
            email: true,
          ),
        TaskKind.deadline => const TaskKindForm(
            title: 'deadlineTitle',
            when: 'deadlineWhen',
            notes: 'toSubmit',
          ),
        TaskKind.filing => const TaskKindForm(
            title: 'filingTitle',
            when: 'deadlineWhen',
            where: 'fileWhere',
          ),
        TaskKind.documents => const TaskKindForm(
            title: 'docsTitle',
            when: 'byWhen',
            contact: 'docsFrom',
            phone: true,
            email: true,
          ),
        TaskKind.review => const TaskKindForm(
            title: 'reviewTitle',
            when: 'byWhen',
            notes: 'lookFor',
          ),
        TaskKind.sign => const TaskKindForm(
            title: 'signTitle',
            when: 'byWhen',
            contact: 'signWith',
            phone: true,
          ),
        TaskKind.print => const TaskKindForm(
            title: 'printTitle',
            when: 'byWhen',
            notes: 'copies',
          ),
        TaskKind.visit => const TaskKindForm(
            title: 'visitTitle',
            where: 'visitWhere',
            contact: 'visitWho',
            phone: true,
            notes: 'toBring',
          ),
        TaskKind.jailVisit => const TaskKindForm(
            title: 'jailTitle',
            where: 'jailWhere',
            contact: 'jailWho',
            notes: 'toBring',
          ),
        TaskKind.payment => const TaskKindForm(
            title: 'payTitle',
            when: 'payWhen',
            contact: 'payWho',
            phone: true,
            email: true,
            notes: 'payDetails',
          ),
        TaskKind.research => const TaskKindForm(
            title: 'researchTitle',
            when: 'byWhen',
            notes: 'questions',
          ),
        TaskKind.other => const TaskKindForm(
            title: 'otherTitle',
            where: 'place',
            contact: 'contactName',
            phone: true,
            email: true,
          ),
      };
}
