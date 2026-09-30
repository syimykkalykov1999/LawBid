// Dev-only (owner request 2026-09-30, OQ-034): one post and one case in
// EVERY practice category, so each default practice photo can be seen in
// the post and case cards. Posts carry no photos on purpose (the card then
// shows our photo for the practice). Idempotent: skips titles that exist.
//
//   node scripts/seed-demo-all.mjs
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

if (process.env.NODE_ENV === 'production') throw new Error('dev only');
const API = process.env.DEMO_API ?? 'http://localhost:3000/api/v1';
const prisma = new PrismaClient();
const now = new Date();

// [category, post title, post text, case title, case description, budget $]
const ROWS = [
  ['immigration', 'Visa overstay: what happens next', 'An overstay does not always mean a ban. How long you stayed and how you entered decide your options.', 'Wife overstayed her visa, want to fix status', 'My wife came on a B-2 visa and overstayed by eight months. We married last year and want to know if she can adjust status here in Illinois.', 2500],
  ['family_law', 'Parenting plans that actually work', 'Write down holidays, school breaks and pickup times. Vague plans end up back in court.', 'Need a parenting plan after separation', 'We separated in May and share two kids. We mostly agree but need a written parenting plan and child support worked out properly.', 2000],
  ['traffic_tickets', 'Should you fight a red light camera ticket?', 'Camera tickets are civil in many cities. Check the photos and the deadline before you pay.', 'Red light camera ticket, I was not driving', 'I got a red light camera ticket in Chicago but my brother had my car that day. I want to contest it properly.', 300],
  ['dui_and_dwi', 'Refused the breath test? Read this', 'A refusal can mean a longer license suspension than a failed test. Ask for a hearing fast.', 'Refused breathalyzer, license suspended', 'I was pulled over in Naperville and refused the breath test. My license is suspended and I need it for work.', 2500],
  ['criminal_defense', 'Talk to a lawyer before the police', 'You have the right to stay silent. Saying "I want a lawyer" is not an admission of anything.', 'Charged with retail theft, first time', 'I was charged with retail theft at a mall in Schaumburg. It is my first offense and I am worried about my record.', 1500],
  ['personal_injury', 'Slip and fall in a store: first steps', 'Report it, photograph the floor and keep your shoes. Stores fix hazards fast.', 'Fell on a wet floor at a grocery store', 'I slipped on an unmarked wet floor at a grocery store and hurt my wrist. I have medical bills and missed two weeks of work.', 0],
  ['medical_malpractice', 'When is a bad outcome malpractice?', 'Not every complication is negligence. The question is whether care fell below the standard.', 'Surgery complication, doctor ignored symptoms', 'After a routine surgery I had severe pain for days. The doctor ignored it and I later needed a second operation.', 0],
  ['workers_compensation', 'Hurt at work? Report it in writing', 'Tell your employer in writing within days. Late notice is the easiest reason to deny a claim.', 'Back injury at warehouse, claim denied', 'I hurt my back lifting boxes at a warehouse. My employer says it happened at home and denied the claim.', 0],
  ['estate_planning_and_probate', 'A will is not enough for everyone', 'If you own a home or have kids, ask about a living trust and a power of attorney too.', 'Need a will and trust for our family', 'We have two young children and own a house in Evanston. We want a will, a trust and guardianship set up.', 1800],
  ['elder_law', 'Planning for long-term care costs', 'Medicaid planning works best years before care is needed. Start the conversation early.', 'Help my mother qualify for Medicaid', 'My mother needs nursing home care soon. We need advice on Medicaid eligibility and protecting her house.', 2200],
  ['real_estate', 'Read the inspection contingency', 'Your right to walk away after a bad inspection depends on the contract wording and the deadline.', 'Seller hid water damage in the basement', 'We bought a house and found hidden water damage the seller did not disclose. Repairs are estimated at $18,000.', 3000],
  ['landlord_and_tenant', 'Security deposit rules in Illinois', 'Landlords must return the deposit or an itemized list of deductions on time.', 'Landlord keeps my full security deposit', 'I moved out in good condition but my landlord kept the entire $2,400 deposit with no itemized list.', 600],
  ['employment_and_labor', 'Unpaid overtime is recoverable', 'If you work more than 40 hours, the title "manager" alone does not make you exempt.', 'Not paid overtime as an assistant manager', 'I work 55 hours a week as an assistant manager but I am paid a flat salary with no overtime.', 0],
  ['bankruptcy_and_debt', 'Chapter 7 or Chapter 13?', 'Your income and whether you want to keep your house usually decide which one fits.', 'Considering bankruptcy after medical debt', 'I have about $60,000 in medical and credit card debt after an illness. I want to know if Chapter 7 is an option.', 1500],
  ['business_and_corporate', 'LLC or corporation for your startup?', 'It depends on investors and taxes. Most small businesses start as an LLC.', 'Forming an LLC with a business partner', 'A friend and I are opening a coffee shop. We need an LLC, an operating agreement and help with the lease.', 1200],
  ['intellectual_property', 'Protect your brand name early', 'Register the trademark before you print packaging. Rebranding later costs far more.', 'Trademark for my clothing brand', 'I sell clothing online under my own brand name and want to register a federal trademark before launching in stores.', 1000],
  ['tax_law', 'Got an IRS letter? Do not ignore it', 'Most notices have a response deadline. Missing it can remove your appeal rights.', 'IRS audit letter for my small business', 'I received an IRS audit letter for my small business for the last two years and need representation.', 2500],
  ['civil_litigation', 'Suing for breach of contract', 'Keep every email and invoice. The written record usually decides these cases.', 'Contractor took payment and never finished', 'I paid a contractor $15,000 to remodel my kitchen. He stopped showing up and will not return the money.', 2000],
  ['consumer_protection', 'Dealer added fees you never agreed to?', 'Compare the final contract to what you were quoted. Hidden add-ons can be illegal.', 'Car dealer added hidden fees to my loan', 'The dealership added a warranty and fees to my car loan that I never agreed to. My payment is $90 higher.', 800],
  ['insurance_law', 'Claim denied? Ask for the reason in writing', 'Insurers must explain denials. The policy wording matters more than the adjuster\'s opinion.', 'Home insurance denied my storm claim', 'A storm damaged my roof and my insurer denied the claim as wear and tear. The roof is only six years old.', 0],
  ['social_security_disability', 'Most disability claims are denied first', 'An appeal with medical records and a hearing often succeeds. Do not give up after one letter.', 'SSDI denied, need help with appeal', 'My disability claim was denied although my doctors say I cannot work. I need help with the appeal hearing.', 0],
  ['veterans_and_military', 'VA disability ratings can be appealed', 'If your rating seems low, new medical evidence can support an increase.', 'VA rating too low for my back injury', 'I am a veteran with a service-connected back injury. The VA gave me 10% and I believe it should be higher.', 0],
  ['civil_rights', 'Know your rights at a traffic stop', 'You can stay silent and decline a search. Stay calm and keep your hands visible.', 'Excessive force during an arrest', 'I was injured during an arrest for a minor offense. I have video from a bystander and medical records.', 0],
  ['education_law', 'IEP meetings: bring a written list', 'Parents are equal members of the IEP team. Ask for everything in writing.', 'School refuses IEP services for my son', 'My son has ADHD and dyslexia. The school keeps delaying an IEP evaluation and his grades are falling.', 1200],
  ['health_care_law', 'Surprise medical bills and your rights', 'Federal rules now protect many patients from surprise out-of-network bills.', 'Hospital billed me out-of-network', 'I went to an in-network hospital but received a $7,000 bill from an out-of-network anesthesiologist.', 500],
  ['government_and_administrative_law', 'Appealing a government agency decision', 'Administrative appeals have short deadlines. Read the notice for the date.', 'City denied my business license renewal', 'The city denied my restaurant license renewal over a paperwork issue. I need to appeal before it expires.', 1500],
  ['appeals', 'An appeal is not a new trial', 'Appeals review legal errors in the record. New evidence usually cannot be added.', 'Appeal of a civil judgment against me', 'A judge ruled against me in a contract dispute and I believe the court misapplied the law. I want to appeal.', 5000],
  ['construction_law', 'Mechanics liens protect contractors', 'Unpaid contractors can file a lien, but strict notice deadlines apply.', 'Subcontractor filed a lien on my home', 'My general contractor did not pay a subcontractor, who filed a lien on my house even though I paid in full.', 2000],
  ['securities_and_financial_law', 'Broker losses may be recoverable', 'Unsuitable investments or unauthorized trades can be pursued in arbitration.', 'Broker made trades without my approval', 'My broker made risky trades in my retirement account without my approval and I lost $40,000.', 0],
  ['environmental_and_energy_law', 'Contamination next door?', 'Neighbors affected by pollution may have claims even without a contract.', 'Factory runoff is polluting my well', 'A factory near my property is releasing runoff and my well water tested positive for chemicals.', 0],
  ['technology_privacy_and_cyber_law', 'Data breach notice: what to do', 'Freeze your credit, change passwords and keep the notice letter.', 'My data was leaked in a company breach', 'A company I used exposed my Social Security number in a data breach and I now have fraudulent accounts.', 0],
  ['entertainment_media_and_sports_law', 'Read the contract before you sign', 'Rights to your music or image can be signed away for years. Check the term.', 'Record label contract review', 'An independent label offered me a recording contract. I need a lawyer to review royalties and rights.', 800],
  ['aviation_and_maritime_law', 'Injured on a flight or cruise?', 'Special rules and short deadlines apply to airline and cruise claims.', 'Injured on a cruise ship excursion', 'I was injured during an excursion booked through the cruise line. The ship says it is not responsible.', 0],
  ['international_and_cross_border_law', 'Doing business abroad', 'Contracts with foreign partners should name the governing law and the court.', 'Supplier in Mexico breached our contract', 'Our supplier in Mexico stopped shipping after we paid a deposit. We need to recover the funds.', 3000],
  ['antitrust_and_trade_regulation', 'Non-compete agreements are changing', 'Many states now limit non-competes. Yours may not be enforceable.', 'Former employer enforcing a non-compete', 'I left my job and my former employer says my non-compete blocks me from working in my field for two years.', 1500],
  ['nonprofit_and_religious_organizations', 'Starting a nonprofit the right way', '501(c)(3) status requires bylaws, a board and a detailed IRS application.', 'Help forming a 501(c)(3) nonprofit', 'We run a youth sports program and want to form a nonprofit and apply for tax-exempt status.', 1200],
  ['native_american_and_tribal_law', 'Tribal court or state court?', 'Jurisdiction depends on where it happened and who is involved.', 'Dispute over land lease on tribal land', 'I lease land from a tribe for my business and there is a dispute about renewal terms.', 2000],
  ['animal_law', 'Dog bite: who is responsible?', 'Illinois holds owners liable in most cases when a dog attacks without provocation.', 'Neighbor\'s dog bit my daughter', 'My neighbor\'s dog bit my 9-year-old daughter on the arm. She needed stitches and is afraid to go outside.', 0],
  ['cannabis_alcohol_and_firearms_law', 'Licensing rules for liquor sales', 'A liquor license comes with strict conditions. Violations can cost the license.', 'Liquor license violation notice for my bar', 'My bar received a violation notice for serving after hours. I want to keep my liquor license.', 1500],
  ['agriculture_and_gaming_law', 'Farm leases need to be in writing', 'Oral farm leases often cause disputes about crops and termination dates.', 'Farm lease dispute with landowner', 'I farm 200 acres under an oral lease. The landowner now wants to end it mid-season.', 1500],
  ['legal_malpractice', 'When your lawyer missed a deadline', 'If a missed deadline cost you your case, you may have a malpractice claim.', 'My lawyer missed the filing deadline', 'My previous lawyer missed the statute of limitations for my injury case and it was dismissed.', 0],
  ['general_practice', 'Not sure what kind of lawyer you need?', 'Describe your situation in plain words. A general practice lawyer can point you the right way.', 'Not sure which lawyer I need', 'I received a letter from a collection agency about a debt I do not recognize and a notice from the city.', 400],
];

const TAG_OVERRIDES = {
  family_law: 'familylaw', traffic_tickets: 'trafficticket', criminal_defense: 'criminaldefense',
  dui_and_dwi: 'dui', personal_injury: 'personalinjury', real_estate: 'realestate',
  employment_and_labor: 'employment', bankruptcy_and_debt: 'bankruptcy',
};
const tagFor = (c) =>
  TAG_OVERRIDES[c] ?? c.replace(/_and_/g, '_').replace(/_/g, '').slice(0, 30);

async function call(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'idempotency-key': randomUUID(),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json.data;
}
async function login(phone) {
  await call('POST', '/auth/otp/request', null, { channel: 'phone', identifier: phone });
  return (await call('POST', '/auth/otp/verify', null, { channel: 'phone', identifier: phone, code: '000000' })).accessToken;
}

// First leaf of every category (+ CDL for the truck photo).
const seed = JSON.parse(readFileSync('prisma/seed/practice_areas.seed.json', 'utf-8'));
const leafCode = Object.fromEntries(seed.map((c) => [c.code, c.children[0].code]));

// Demo attorney licensed in IL with every category: sees every demo case.
const ALEX = { phone: '+13125550105', first: 'Alex', last: 'Morgan', username: 'alexmorgan_law' };
let alex = await prisma.user.findUnique({ where: { phone_e164: ALEX.phone } });
if (!alex) {
  alex = await prisma.user.create({
    data: {
      role: 'attorney', first_name: ALEX.first, last_name: ALEX.last,
      phone_e164: ALEX.phone, phone_verified_at: now,
      identifiers: { create: { provider: 'phone', provider_uid: ALEX.phone, verified_at: now } },
    },
  });
  await prisma.onboardingState.create({ data: { user_id: alex.id, completed_at: now } });
  await prisma.attorneyProfile.create({
    data: {
      user_id: alex.id, username: ALEX.username, username_lower: ALEX.username,
      bio: 'General practice in Chicago. Demo account covering every practice area.',
      firm_name: 'Morgan Law Group', firm_names: ['Morgan Law Group'], languages: ['en'],
      verification_status: 'verified', verified_at: now,
      verified_first_name: ALEX.first, verified_last_name: ALEX.last,
    },
  });
  await prisma.attorneyLicense.create({
    data: { attorney_id: alex.id, state_code: 'IL', bar_number: 'IL-6123456', license_status: 'verified', verified_at: now },
  });
  await prisma.subscription.create({
    data: { user_id: alex.id, status: 'active', price_cents: 39900, current_period_start: now, current_period_end: new Date(now.getTime() + 30 * 864e5) },
  });
}
for (const code of [...Object.values(leafCode), 'traffic_tickets.cdl_violations']) {
  const pa = await prisma.practiceArea.findUnique({ where: { code } });
  if (pa && !(await prisma.attorneyPracticeArea.findFirst({ where: { attorney_id: alex.id, practice_area_id: pa.id } }))) {
    await prisma.attorneyPracticeArea.create({ data: { attorney_id: alex.id, practice_area_id: pa.id } });
  }
}

// Posts: spread over the demo attorneys (10 posts/day each).
const AUTHORS = ['+13125550105', '+13125550101', '+13125550102', '+13125550103', '+13125550104'];
const tokens = {};
let n = 0;
for (const [cat, title, text] of ROWS) {
  const exists = await prisma.post.findFirst({ where: { body: { startsWith: title }, deleted_at: null } });
  if (exists) continue;
  // The author with daily budget left (10 posts per 24 h).
  let phone = null;
  for (const ph of AUTHORS) {
    const u = await prisma.user.findUnique({ where: { phone_e164: ph } });
    const today = await prisma.post.count({
      where: { author_id: u.id, created_at: { gt: new Date(Date.now() - 864e5) } },
    });
    if (today < 10) { phone = ph; break; }
  }
  if (!phone) { console.log('daily post budget used up'); break; }
  n++;
  tokens[phone] ??= await login(phone);
  await call('POST', '/posts', tokens[phone], { body: `${title}\n\n${text} #${tagFor(cat)}` });
}
console.log(`posts published: ${n}`);

// Cases: all by the Illinois demo client, one per category (+ CDL).
const client = await prisma.user.findUnique({ where: { phone_e164: '+13125550203' } });
if (!client) throw new Error('run seed-demo.mjs first (demo client kwalsh)');
const caseRows = [
  ...ROWS.map(([cat, , , t, d, b]) => [leafCode[cat], t, d, b]),
  ['traffic_tickets.cdl_violations', 'CDL overweight ticket on I-80', 'I drive a semi and got an overweight citation on I-80 near Joliet. I need to keep my CDL clean for my job.', 900],
];
let c = 0;
let clientToken;
for (const [code, title, description, budget] of caseRows) {
  if (await prisma.case.findFirst({ where: { client_id: client.id, title } })) continue;
  clientToken ??= await login('+13125550203');
  const pa = await prisma.practiceArea.findUnique({ where: { code } });
  await call('POST', '/cases', clientToken, {
    practiceAreaId: pa.id, title, description, primaryStateCode: 'IL',
    budgetMode: budget ? 'amount' : 'clarify_later',
    ...(budget ? { budgetAmountDollars: budget } : {}),
    clientContactSharingConsent: true,
  });
  c++;
}
console.log(`cases published: ${c}`);
await prisma.$disconnect();
