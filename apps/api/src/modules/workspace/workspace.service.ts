import { userInScope } from '../countries/country-scope';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { grants, type AdminArea } from '../admin-auth/admin-permissions';
import { RewardsService } from '../rewards/rewards.service';
import type { MyRewardsDto } from '../rewards/rewards.dto';
import { SupportTeamService } from '../support/support-team.service';
import type { WorkspaceDto, WorkspaceQueueDto } from './workspace.dto';

const DAY_MS = 86_400_000;

/**
 * Owner 2026-10-05 — «Рабочее место»: every employee sees only the
 * queues of their own areas, how much waits and what is late, and opens
 * them one by one (verifier, support, moderation) or on the full page.
 */
@Injectable()
export class WorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly team: SupportTeamService,
    private readonly rewards: RewardsService,
  ) {}

  async forAdmin(admin: AdminActor): Promise<WorkspaceDto> {
    const owner = admin.adminRole === 'super_admin';
    const can = (area: AdminArea, level: 'view' | 'manage' = 'view') =>
      owner ||
      grants(admin.permissions ?? {}, area, level) ||
      (admin.manageAdmins === true && (level === 'view' || area === 'payroll'));
    const now = Date.now();
    const dayAgo = new Date(now - DAY_MS);
    const jobs: Promise<WorkspaceQueueDto>[] = [];
    // Owner 2026-10-05: an employee of one country (or a country tab)
    // counts only that country's queues.
    const scope = admin.countries ?? null;
    const people = userInScope(scope);
    const inCases = scope
      ? { case: { primary_state: { country_code: { in: scope } } } }
      : {};

    if (can('verification')) {
      jobs.push(
        Promise.all([
          this.prisma.verificationRequest.count({
            where: {
              status: { in: ['submitted', 'in_review'] },
              attorney: { user: people },
            },
          }),
          this.prisma.verificationRequest.count({
            where: {
              status: { in: ['submitted', 'in_review'] },
              submitted_at: { lt: dayAgo },
              attorney: { user: people },
            },
          }),
        ]).then(([count, urgent]) => ({
          key: 'verification',
          label: 'Проверка адвокатов',
          unit: 'заявок',
          count,
          urgent,
          href: '/verification',
          focus: true,
          canAct: can('verification', 'manage'),
        })),
      );
    }
    if (can('support')) {
      jobs.push(
        Promise.all([
          this.prisma.supportTicket.count({
            where: {
              status: 'open',
              OR: [{ assignee_id: admin.id }, { assignee_id: null }],
              ...(scope ? { country_code: { in: scope } } : {}),
            },
          }),
          this.prisma.supportTicket.count({
            where: {
              sla_due_at: { not: null },
              sla_breached_at: { not: null },
              ...(scope ? { country_code: { in: scope } } : {}),
            },
          }),
        ]).then(([count, urgent]) => ({
          key: 'support',
          label: 'Поддержка',
          unit: 'обращений',
          count,
          urgent,
          href: '/support',
          focus: true,
          canAct: can('support', 'manage'),
        })),
      );
    }
    if (can('moderation')) {
      jobs.push(
        Promise.all([
          this.prisma.report.count({
            where: { status: 'open', reporter: people },
          }),
          this.prisma.report.count({
            where: {
              status: 'open',
              created_at: { lt: dayAgo },
              reporter: people,
            },
          }),
        ]).then(([count, urgent]) => ({
          key: 'moderation',
          label: 'Жалобы',
          unit: 'жалоб',
          count,
          urgent,
          href: '/moderation',
          focus: true,
          canAct: can('moderation', 'manage'),
        })),
        this.prisma.clientReviewAppeal
          .count({ where: { status: 'pending', appellant: people } })
          .then((count) => ({
            key: 'review_appeals',
            label: 'Обжалования отзывов',
            unit: 'обжалований',
            count,
            urgent: 0,
            href: '/review-appeals',
            focus: false,
            canAct: can('moderation', 'manage'),
          })),
      );
    }
    if (can('cases')) {
      jobs.push(
        Promise.all([
          this.prisma.caseDispute.count({
            where: { status: 'open', ...inCases },
          }),
          this.prisma.contactIssueReport.count({
            where: { status: 'open', ...inCases },
          }),
        ]).then(([disputes, contact]) => ({
          key: 'cases',
          label: 'Споры и «не могу связаться»',
          unit: 'случаев',
          count: disputes + contact,
          urgent: 0,
          href: '/cases',
          focus: false,
          canAct: can('cases', 'manage'),
        })),
      );
    }
    if (can('payroll')) {
      jobs.push(
        Promise.all([
          this.prisma.payrollAccrual.count({ where: { status: 'pending' } }),
          this.prisma.payrollPayout.count({ where: { status: 'failed' } }),
        ]).then(([count, urgent]) => ({
          key: 'payroll',
          label: 'Зарплаты и начисления',
          unit: 'начислений',
          count,
          urgent,
          href: '/payroll',
          focus: false,
          canAct: can('payroll', 'manage'),
        })),
      );
    }
    if (owner || admin.manageAdmins) {
      jobs.push(
        Promise.all([
          this.prisma.seatLimitRequest.count({ where: { status: 'pending' } }),
          this.prisma.subscription.count({ where: { status: 'past_due' } }),
        ]).then(([seats, pastDue]) => ({
          key: 'money',
          label: 'Деньги: запросы мест и долги',
          unit: 'запросов',
          count: seats + pastDue,
          urgent: pastDue,
          href: '/subscriptions',
          focus: false,
          canAct: owner,
        })),
      );
    }

    const [queues, shift] = await Promise.all([
      Promise.all(jobs),
      can('support', 'manage')
        ? this.team
            .agents()
            .then((all) => all.find((a) => a.adminId === admin.id) ?? null)
        : Promise.resolve(null),
    ]);
    return { queues, shift };
  }

  myRewards(admin: AdminActor): Promise<MyRewardsDto> {
    return this.rewards.mine(admin.id);
  }
}
