require('dotenv').config({ path: 'C:\\Users\\gpghe\\.env.shared' });
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });

const app = express();
app.set('trust proxy', 1);
app.use(generalLimiter);
const PORT = process.env.PORT || 3008;

const APP_VERSION = 'v1.0';
const LAST_DEPLOY = 'April 17, 2026 6:00 AM EST';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'marketingcommand2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));

app.use((req, res, next) => {
  res.locals.version = APP_VERSION;
  res.locals.lastUpdated = LAST_DEPLOY;
  res.locals.appName = 'Marketing Command';
  res.locals.isLoggedIn = !!(req.session && req.session.admin);
  next();
});

const ADMIN_USER = 'mcadmin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || '';

const intakes = [
  {
    id: 1,
    firstName: 'Maria',
    lastName: 'Gonzalez',
    email: 'maria@gonzalezrealty.com',
    phone: '(512) 555-0142',
    businessName: 'Gonzalez Realty',
    businessType: 'Small Brokerage',
    markets: 'Texas - Austin Metro',
    years: '8',
    currentTools: ['GoHighLevel', 'Calendly', 'Google Workspace'],
    painPoint: 'Our GHL is set up badly - pipelines are a mess and nothing flows from our calls into our CRM. Need help from someone who actually knows the system.',
    currentSpend: '$300-700',
    goals: ['Get integrations actually working', 'Professional setup I can trust', 'Scale to more agents/team members'],
    package: 'Growth',
    timing: 'Within 30 days',
    budget: '$700-1500',
    notes: 'We have 6 agents. Want everyone on one stack by Q3.',
    source: 'Referral',
    submittedAt: 'Apr 17, 3:00 PM',
    status: 'NEW'
  },
  {
    id: 2,
    firstName: 'Ryan',
    lastName: 'Patel',
    email: 'ryan@patelwholesale.com',
    phone: '(404) 555-0188',
    businessName: 'Patel Wholesale',
    businessType: 'Wholesaler',
    markets: 'Georgia - Atlanta Metro',
    years: '3',
    currentTools: ['Twilio', 'Carrd'],
    painPoint: 'I am doing everything manually. Need a dialer, a CRM, and phone numbers that all talk to each other.',
    currentSpend: '$100-300',
    goals: ['Set up tools faster', 'One bill instead of six'],
    package: 'Starter',
    timing: 'Immediately',
    budget: '$300-700',
    notes: 'Solo wholesaler. Want to get started this week.',
    source: 'Podcast',
    submittedAt: 'Apr 17, 11:00 AM',
    status: 'CONTACTED'
  },
  {
    id: 3,
    firstName: 'Tim',
    lastName: 'Morrison',
    email: 'tim@morrisonhomes.com',
    phone: '(602) 555-0177',
    businessName: 'Morrison Homes',
    businessType: 'Agent Team',
    markets: 'Arizona - Phoenix, Tucson',
    years: '12',
    currentTools: ['GoHighLevel', 'CallRail', 'ActiveCampaign', 'Calendly', 'Buffer'],
    painPoint: 'Six separate vendors, six separate bills. Onboarding a new agent takes 2 weeks of admin setup.',
    currentSpend: '$1500+',
    goals: ['One bill instead of six', 'Team accounts under one roof', 'Professional setup I can trust'],
    package: 'Team',
    timing: 'Within 90 days',
    budget: '$1500-3000',
    notes: 'Team of 9 agents plus a TC. Want to migrate everything by end of quarter.',
    source: 'PwP Product',
    submittedAt: 'Apr 16, 5:00 PM',
    status: 'QUOTED'
  }
];

let nextIntakeId = 4;

// Daily email cap — 20 intake notification emails/day max
let _mktDailySent = 0;
let _mktDailyDate = '';
const MKT_DAILY_CAP = 20;
function mktCapReached() {
  const today = new Date().toISOString().slice(0, 10);
  if (_mktDailyDate !== today) { _mktDailySent = 0; _mktDailyDate = today; }
  return _mktDailySent >= MKT_DAILY_CAP;
}
function mktIncrementSent(n = 1) {
  const today = new Date().toISOString().slice(0, 10);
  if (_mktDailyDate !== today) { _mktDailySent = 0; _mktDailyDate = today; }
  _mktDailySent += n;
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.redirect('/login');
}

function getTransporter() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });
}

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', service: 'marketing-command', version: APP_VERSION });
});

app.get('/', (req, res) => {
  res.render('home');
});

// Owner Outreach Marketing Studio — self-contained acquisition-outreach tool
// (MHP / MF / Storage / Laundromat / Car Wash mail-merge). Explicit route so it
// serves reliably regardless of static-middleware ordering.
app.get(['/owner-outreach-studio', '/owner-outreach-studio.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'owner-outreach-studio.html'));
});

app.get('/tools', (req, res) => {
  res.render('tools', { tools: TOOLS_CATALOG });
});

app.get('/packages', (req, res) => {
  res.render('packages');
});

app.get('/get-started', (req, res) => {
  res.render('get-started', { tools: TOOLS_CATALOG });
});

app.post('/submit-intake', async (req, res) => {
  const b = req.body;
  if (!b.firstName || !b.lastName || !b.email || !b.phone) {
    return res.status(400).send('Missing required fields');
  }

  const currentTools = Array.isArray(b.currentTools) ? b.currentTools : (b.currentTools ? [b.currentTools] : []);
  const goals = Array.isArray(b.goals) ? b.goals : (b.goals ? [b.goals] : []);

  const intake = {
    id: nextIntakeId++,
    firstName: b.firstName,
    lastName: b.lastName,
    email: b.email,
    phone: b.phone,
    businessName: b.businessName || '',
    businessType: b.businessType || '',
    markets: b.markets || '',
    years: b.years || '',
    currentTools,
    painPoint: b.painPoint || '',
    currentSpend: b.currentSpend || '',
    goals,
    otherGoal: b.otherGoal || '',
    package: b.package || 'Not sure',
    timing: b.timing || '',
    budget: b.budget || '',
    notes: b.notes || '',
    source: b.source || '',
    submittedAt: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    status: 'NEW'
  };
  intakes.unshift(intake);

  const transporter = getTransporter();
  if (transporter && !mktCapReached()) {
    const adminHtml = `
      <h2>New Marketing Command Intake</h2>
      <p><strong>${intake.firstName} ${intake.lastName}</strong> &lt;${intake.email}&gt; &middot; ${intake.phone}</p>
      <p><strong>Business:</strong> ${intake.businessName || '-'} (${intake.businessType || '-'})</p>
      <p><strong>Markets:</strong> ${intake.markets || '-'} &middot; <strong>Years:</strong> ${intake.years || '-'}</p>
      <hr>
      <p><strong>Current tools:</strong> ${currentTools.join(', ') || '-'}</p>
      <p><strong>Pain point:</strong> ${intake.painPoint || '-'}</p>
      <p><strong>Current monthly spend:</strong> ${intake.currentSpend || '-'}</p>
      <hr>
      <p><strong>Goals:</strong> ${goals.join(', ') || '-'}${intake.otherGoal ? ' | Other: ' + intake.otherGoal : ''}</p>
      <p><strong>Package interest:</strong> ${intake.package}</p>
      <p><strong>Timing:</strong> ${intake.timing || '-'} &middot; <strong>Budget:</strong> ${intake.budget || '-'}</p>
      <hr>
      <p><strong>Notes:</strong> ${intake.notes || '-'}</p>
      <p><strong>Source:</strong> ${intake.source || '-'}</p>
    `;
    try {
      await transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: 'steve@goodpeoplegoodhomes.com',
        subject: `Marketing Command intake: ${intake.firstName} ${intake.lastName} (${intake.package})`,
        html: adminHtml
      });
      await transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: intake.email,
        subject: 'We got your Marketing Command intake',
        html: `
          <p>Hi ${intake.firstName},</p>
          <p>Thanks for reaching out to Marketing Command. We received your intake and will respond within one business day with a recommendation, timeline, and quote.</p>
          <p>In the meantime, feel free to explore the tool catalog and packages on marketingcommand.com.</p>
          <p>— Stephen Franco<br>Founder, Projects with a Purpose LLC</p>
        `
      });
      mktIncrementSent(2);
    } catch (err) {
      console.error('Email send failed:', err.message);
    }
  } else {
    console.log('[intake] email transport not configured or daily cap reached, skipped sending');
  }

  res.redirect('/thank-you');
});

app.get('/thank-you', (req, res) => {
  res.render('thank-you');
});

app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.admin = true;
    return res.redirect('/admin-dashboard');
  }
  res.render('login', { error: 'Invalid credentials' });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.get('/admin-dashboard', requireAdmin, (req, res) => {
  const packagePrices = { Starter: 297, Growth: 697, Team: 1497, Enterprise: 3000 };
  const estimatedMRR = intakes.reduce((sum, i) => sum + (packagePrices[i.package] || 0), 0);
  const thisWeek = intakes.filter(i => i.submittedAt.startsWith('Apr 17') || i.submittedAt.startsWith('Apr 16') || i.submittedAt.startsWith('Apr 15') || i.submittedAt.startsWith('Apr 14')).length;
  const converted = intakes.filter(i => i.status === 'QUOTED' || i.status === 'CONVERTED').length;
  const conversionRate = intakes.length ? Math.round((converted / intakes.length) * 100) : 0;

  res.render('admin-dashboard', {
    intakes,
    stats: {
      total: intakes.length,
      thisWeek,
      conversionRate,
      estimatedMRR
    }
  });
});

app.post('/admin/intake/:id/status', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const intake = intakes.find(i => i.id === id);
  if (intake && req.body.status) intake.status = req.body.status;
  res.redirect('/admin-dashboard');
});

// Additive, read-only status feed for the Franco HQ single-pane dashboard.
// Counts and short labels only — no PII. Never throws.
app.get('/api/hq', (req, res) => {
  try {
    const countBy = (s) => intakes.filter(i => i.status === s).length;
    const thisWeek = intakes.filter(i => i.submittedAt.startsWith('Apr 17') || i.submittedAt.startsWith('Apr 16') || i.submittedAt.startsWith('Apr 15') || i.submittedAt.startsWith('Apr 14')).length;
    const converted = intakes.filter(i => i.status === 'QUOTED' || i.status === 'CONVERTED').length;
    const conversionPct = intakes.length ? Math.round((converted / intakes.length) * 100) : 0;
    res.json({
      ok: true,
      service: 'Marketing Command',
      intakes: {
        total: intakes.length,
        new: countBy('NEW'),
        contacted: countBy('CONTACTED'),
        quoted: countBy('QUOTED'),
        converted: countBy('CONVERTED')
      },
      this_week: thisWeek,
      conversion_pct: conversionPct,
      time: new Date().toISOString()
    });
  } catch (e) {
    res.json({ ok: false, error: String(e) });
  }
});

app.get('/about', (req, res) => {
  res.render('about');
});

const TOOLS_CATALOG = [
  {
    name: 'GoHighLevel',
    categories: ['CRM', 'Automations', 'Landing Pages', 'SMS', 'Email'],
    tagline: 'CRM + automations',
    description: 'The real estate industry standard all-in-one platform. Contacts, pipelines, automations, landing pages, SMS and email sends, booking calendar.',
    features: [
      'Fully-configured GHL sub-account with your branding',
      'Industry-standard pipelines pre-built',
      '12 automation workflows ready to use'
    ],
    tiers: ['STARTER', 'GROWTH', 'TEAM', 'ENTERPRISE'],
    icon: 'GHL'
  },
  {
    name: 'Twilio',
    categories: ['Phone', 'SMS'],
    tagline: 'Phone and SMS infrastructure',
    description: 'Phone numbers and SMS capability that power the entire stack. One local phone number assigned to you, toll-free optional.',
    features: [
      'Local or toll-free number',
      'SMS capable, call forwarding to your cell',
      'Voicemail transcription'
    ],
    tiers: ['STARTER', 'GROWTH', 'TEAM', 'ENTERPRISE'],
    icon: 'TW'
  },
  {
    name: 'SmrtPhone',
    categories: ['Phone'],
    tagline: 'Real estate dialer',
    description: 'Power dialer built for real estate. Parallel dialing, list management, answering machine detection, disposition tracking.',
    features: [
      'Parallel dialing + AMD',
      'List management and dispositions',
      'One-click GHL call logging'
    ],
    tiers: ['GROWTH', 'TEAM', 'ENTERPRISE'],
    icon: 'SP'
  },
  {
    name: 'CallRail',
    categories: ['Phone', 'Analytics'],
    tagline: 'Call tracking and recording',
    description: 'Track which marketing channels drive which phone calls. Record all inbound and outbound calls. Analyze conversion by source.',
    features: [
      'Channel-level call attribution',
      'Full call recording',
      'Automatic GHL contact enrichment'
    ],
    tiers: ['GROWTH', 'TEAM', 'ENTERPRISE'],
    icon: 'CR'
  },
  {
    name: 'ActiveCampaign',
    categories: ['Email'],
    tagline: 'Email automation',
    description: 'Advanced email sequencing, behavioral triggers, split testing, CRM-grade contact management.',
    features: [
      'Behavioral triggers and segmentation',
      'Split testing',
      'Deep sequencing for drip campaigns'
    ],
    tiers: ['GROWTH', 'TEAM', 'ENTERPRISE'],
    icon: 'AC'
  },
  {
    name: 'Mailgun',
    categories: ['Email'],
    tagline: 'Transactional email',
    description: 'Reliable transactional email delivery for system notifications, receipts, confirmations. High deliverability, no marketing risk.',
    features: [
      'High-deliverability transactional sends',
      'Separate from marketing streams',
      'Webhook event tracking'
    ],
    tiers: ['TEAM', 'ENTERPRISE'],
    icon: 'MG'
  },
  {
    name: 'Calendly',
    categories: ['Calendar'],
    tagline: 'Booking calendar',
    description: 'Client booking with buffer times, round-robin for teams, branded booking pages, automated reminders.',
    features: [
      'Round-robin team booking',
      'Branded booking pages',
      'Google Calendar + GHL sync'
    ],
    tiers: ['STARTER', 'GROWTH', 'TEAM', 'ENTERPRISE'],
    icon: 'CL'
  },
  {
    name: 'Loom',
    categories: ['Video'],
    tagline: 'Video messaging',
    description: 'Record quick video walkthroughs and send by link. Watch analytics show when prospects view.',
    features: [
      'Listing intros and contract explainers',
      'Watch-time analytics',
      'One-click share links'
    ],
    tiers: ['GROWTH', 'TEAM', 'ENTERPRISE'],
    icon: 'LM'
  },
  {
    name: 'BombBomb',
    categories: ['Video', 'Email'],
    tagline: 'Video email',
    description: 'Video-in-email for real estate. Branded player, watch analytics, mobile-friendly.',
    features: [
      'Branded in-email video player',
      'Watch analytics',
      'Mobile-optimized delivery'
    ],
    tiers: ['TEAM', 'ENTERPRISE'],
    icon: 'BB'
  },
  {
    name: 'Carrd',
    categories: ['Landing Pages'],
    tagline: 'Simple landing pages',
    description: 'Single-page landing sites for listing pages, recruit funnels, offer pages. Fast to build, cheap to host.',
    features: [
      'Fast single-page builds',
      'Listing, recruit, and offer templates',
      'Cheap hosting and easy updates'
    ],
    tiers: ['STARTER', 'GROWTH', 'TEAM', 'ENTERPRISE'],
    icon: 'CD'
  },
  {
    name: 'Unbounce',
    categories: ['Landing Pages'],
    tagline: 'Advanced landing pages',
    description: 'Conversion-optimized landing pages with A/B testing, dynamic text replacement, popup/sticky bar builders.',
    features: [
      'A/B testing and dynamic text',
      'Popup and sticky bar builders',
      'Built for paid traffic funnels'
    ],
    tiers: ['GROWTH', 'TEAM', 'ENTERPRISE'],
    icon: 'UB'
  },
  {
    name: 'Buffer',
    categories: ['Social', 'Content'],
    tagline: 'Social media scheduling',
    description: 'Schedule posts across Facebook, Instagram, LinkedIn, Twitter, TikTok. Content calendar view.',
    features: [
      'Cross-platform scheduling',
      'Content calendar view',
      'Team approval workflows'
    ],
    tiers: ['GROWTH', 'TEAM', 'ENTERPRISE'],
    icon: 'BF'
  },
  {
    name: 'Lob',
    categories: ['Direct Mail'],
    tagline: 'Direct mail automation',
    description: 'Send postcards and letters programmatically. Handwritten font options. Address verification.',
    features: [
      'Programmatic postcards and letters',
      'Handwritten font options',
      'Built-in address verification'
    ],
    tiers: ['GROWTH', 'TEAM', 'ENTERPRISE'],
    icon: 'LB'
  },
  {
    name: 'Google Workspace',
    categories: ['Email', 'Calendar'],
    tagline: 'Email, Drive, Calendar',
    description: 'Professional email on your domain, shared calendars, Drive storage. Sync across every tool in the stack.',
    features: [
      'Email on your own domain',
      'Shared calendars and Drive storage',
      'Syncs across every stack tool'
    ],
    tiers: ['STARTER', 'GROWTH', 'TEAM', 'ENTERPRISE'],
    icon: 'GW'
  },
  {
    name: 'Zapier / Make',
    categories: ['Analytics', 'Automations'],
    tagline: 'Integration glue',
    description: 'Connect anything to anything. We use these to fill gaps between the core tools.',
    features: [
      'Connects anything with an API',
      'Fills gaps between core tools',
      'No separate subscription for most flows'
    ],
    tiers: ['STARTER', 'GROWTH', 'TEAM', 'ENTERPRISE'],
    icon: 'ZM'
  }
];

// Global error handler
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error('[error]', err.message || err);
  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || 'Internal server error',
    code: err.code || err.name || 'INTERNAL_ERROR',
    timestamp: new Date().toISOString()
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Marketing Command ${APP_VERSION} listening on http://localhost:${PORT}`);
    console.log(`Last deploy: ${LAST_DEPLOY}`);
  });
}

module.exports = app;
