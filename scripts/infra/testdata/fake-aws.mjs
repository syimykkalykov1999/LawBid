#!/usr/bin/env node
// Fake `aws ecs` for scripts/infra/pooler-roll.test.sh: just the calls
// pooler-roll.sh and scripts/deploy/roll-services.sh make, on a JSON state
// file ($FAKE_AWS_STATE: {tds: {arn: taskDefinition}, svcs: {name: {td,
// status, running}}}). Every mutating call is appended to $FAKE_AWS_LOG.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const statePath = process.env.FAKE_AWS_STATE;
const st = JSON.parse(readFileSync(statePath, 'utf8'));
const save = () => writeFileSync(statePath, JSON.stringify(st, null, 1));
const log = (line) => appendFileSync(process.env.FAKE_AWS_LOG, `${line}\n`);
const argv = process.argv.slice(2);
const opt = (k) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};
const q = opt('--query') ?? '';
const fail = (msg) => {
  process.stderr.write(`fake aws: ${msg}\n`);
  process.exit(254);
};
const arnOf = (ref) => {
  if (st.tds[ref]) return ref;
  const fam = ref.includes(':') ? ref : null;
  if (fam) return Object.keys(st.tds).find((a) => a.endsWith(`/${fam}`));
  const revs = Object.keys(st.tds)
    .filter((a) => a.split('/')[1].split(':')[0] === ref)
    .sort((a, b) => Number(a.split(':').pop()) - Number(b.split(':').pop()));
  return revs.pop();
};
const [svc, cmd] = argv;
if (svc !== 'ecs') fail(`unexpected ${argv.join(' ')}`);

if (cmd === 'describe-task-definition') {
  const arn = arnOf(opt('--task-definition'));
  if (!arn) fail(`no task definition ${opt('--task-definition')}`);
  const td = { ...st.tds[arn], taskDefinitionArn: arn, revision: Number(arn.split(':').pop()) };
  if (q === 'taskDefinition.runtimePlatform.cpuArchitecture') console.log('X86_64');
  else if (q === 'taskDefinition') console.log(JSON.stringify(td));
  else fail(`query ${q}`);
} else if (cmd === 'register-task-definition') {
  const td = JSON.parse(readFileSync(opt('--cli-input-json').replace('file://', ''), 'utf8'));
  const revs = Object.keys(st.tds).filter((a) => a.split('/')[1].split(':')[0] === td.family);
  const rev = Math.max(0, ...revs.map((a) => Number(a.split(':').pop()))) + 1;
  const arn = `arn:aws:ecs:us-east-1:1:task-definition/${td.family}:${rev}`;
  st.tds[arn] = td;
  save();
  log(`register ${td.family}:${rev}`);
  console.log(arn);
} else if (cmd === 'update-service') {
  const s = st.svcs[opt('--service')];
  if (!s) fail(`no service ${opt('--service')}`);
  const prev = s.td;
  s.td = opt('--task-definition');
  // X1: a service on an ECS built-in strategy gets a service deployment whose
  // describe calls walk through s.nativeSeq ("STATUS\tSTAGE\treason" lines).
  if (['CANARY', 'LINEAR', 'BLUE_GREEN'].includes(s.strategy)) {
    st.sd = st.sd ?? [];
    const n = st.sd.length + 1;
    const seq = s.nativeSeq ?? ['IN_PROGRESS\tPRODUCTION_TRAFFIC_SHIFT\tNone', 'SUCCESSFUL\tCLEAN_UP\tNone'];
    st.sd.unshift({ svc: opt('--service'), arn: `sd/${n}`, rev: `sr/${n}`, td: s.td, seq: [...seq] });
    if (seq.at(-1).startsWith('ROLLBACK')) s.td = prev;
  }
  save();
  log(`update ${opt('--service')} ${opt('--task-definition').split('/')[1]}`);
} else if (cmd === 'list-service-deployments') {
  for (const d of (st.sd ?? []).filter((d) => d.svc === opt('--service'))) console.log(`${d.arn}\t${d.rev}`);
} else if (cmd === 'describe-service-revisions') {
  const d = (st.sd ?? []).find((d) => d.rev === opt('--service-revision-arns'));
  console.log(d ? d.td : 'None');
} else if (cmd === 'describe-service-deployments') {
  const d = (st.sd ?? []).find((d) => d.arn === opt('--service-deployment-arns'));
  if (!d) fail(`no service deployment ${opt('--service-deployment-arns')}`);
  console.log(d.seq.length > 1 ? d.seq.shift() : d.seq[0]);
  save();
} else if (cmd === 'describe-services') {
  const name = opt('--services');
  const s = st.svcs[name];
  if (q === 'services[0].taskDefinition') console.log(s ? s.td : 'None');
  else if (q === 'services[0].deploymentConfiguration.strategy') console.log(s?.strategy ?? 'None');
  else if (q === 'services[0].events[0:8].message') console.log('event');
  else if (q === "services[?status=='ACTIVE'].taskDefinition | [0]") console.log(s && s.status === 'ACTIVE' ? s.td : 'None');
  else if (q.startsWith('services[?status==`ACTIVE`] | length')) console.log(s && s.status === 'ACTIVE' ? 1 : 0);
  else if (q.startsWith('services[?status==`ACTIVE`].runningCount')) console.log(s && s.status === 'ACTIVE' ? s.running : 'None');
  else if (q.startsWith('services[0].deployments[?taskDefinition==')) {
    const rev = q.match(/taskDefinition=='([^']+)'/)[1];
    console.log(s && s.td === rev ? 'COMPLETED\tdone' : 'None');
  } else if (q === 'length(services[0].deployments)') console.log(1);
  else fail(`query ${q}`);
} else fail(`unexpected ${argv.join(' ')}`);
