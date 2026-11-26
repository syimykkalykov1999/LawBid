#!/usr/bin/env node
// Fake `aws` for scripts/deploy/canary.test.sh: only the calls canary.sh makes.
// State ($FAKE_AWS_STATE): { firingSeq: [[alarm names in ALARM] per describe-alarms
// call, the last one repeats], sloLines: [log lines] }.
// Every call is appended to $FAKE_AWS_LOG.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const st = JSON.parse(readFileSync(process.env.FAKE_AWS_STATE, 'utf8'));
const argv = process.argv.slice(2);
appendFileSync(process.env.FAKE_AWS_LOG, `${argv.join(' ')}\n`);
const opt = (k) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};
const [svc, cmd] = argv;
const q = opt('--query') ?? '';
const out = (x) => process.stdout.write(`${x}\n`);

if (svc === 'ecs' && cmd === 'describe-services') {
  const name = opt('--services');
  if (q === 'services[0].deploymentConfiguration.strategy') out('ROLLING');
  else if (name === 'api-canary' && q === 'services[0].status') out(st.canaryUp ? 'ACTIVE' : 'None');
  else if (name === 'api-canary' && q.startsWith('services[0].[deployments[0].rolloutState')) out('COMPLETED\t1');
  else if (name === 'api-canary' && q === 'services[0].runningCount') out('1');
  else if (name === 'api' && q === 'services[0]') out(JSON.stringify({ networkConfiguration: {}, loadBalancers: [{ targetGroupArn: 'tg', containerName: 'api', containerPort: 3000 }] }));
  else process.exit(254);
} else if (svc === 'ecs' && cmd === 'describe-task-definition') {
  out(JSON.stringify({
    family: 'lawbid-prod-api',
    containerDefinitions: [{ name: 'api', image: 'x', environment: [], logConfiguration: { logDriver: 'awslogs', options: { 'awslogs-group': '/ecs/lawbid-prod/api' } } }],
  }));
} else if (svc === 'ecs' && cmd === 'register-task-definition') out('arn:aws:ecs:us-east-1:1:task-definition/lawbid-prod-api:9');
else if (svc === 'ecs' && ['create-service', 'update-service', 'delete-service'].includes(cmd)) {
  if (cmd !== 'update-service') {
    st.canaryUp = cmd === 'create-service';
    writeFileSync(process.env.FAKE_AWS_STATE, JSON.stringify(st));
  }
  out('{}');
}
else if (svc === 'cloudwatch' && cmd === 'describe-alarms') {
  const asked = [];
  for (let i = argv.indexOf('--alarm-names') + 1; i < argv.length && !argv[i].startsWith('--'); i++) asked.push(argv[i]);
  const seq = st.firingSeq ?? [[]];
  const n = st.alarmCalls ?? 0;
  st.alarmCalls = n + 1;
  writeFileSync(process.env.FAKE_AWS_STATE, JSON.stringify(st));
  const hit = seq[Math.min(n, seq.length - 1)].filter((a) => asked.includes(a));
  // Composite alarms come back only when --alarm-types names them (like AWS).
  const types = argv.includes('CompositeAlarm');
  const metric = hit.filter((a) => !a.includes('-slo-'));
  const composite = types ? hit.filter((a) => a.includes('-slo-')) : [];
  out([...metric, ...composite].join('\t'));
} else if (svc === 'logs' && cmd === 'filter-log-events') {
  out(JSON.stringify(st.sloLines ?? []));
} else {
  process.stderr.write(`fake aws: unexpected ${argv.join(' ')}\n`);
  process.exit(254);
}
