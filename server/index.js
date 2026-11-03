import 'dotenv/config';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import rateLimit from 'express-rate-limit';
import nodemailer from 'nodemailer';
import session from 'express-session';
import { initializeDatabase, readDatabase, updateDatabase } from './store.js';

const app = express();
const port = Number(process.env.PORT) || 4000;
const sessionSecret =
  process.env.SESSION_SECRET || randomBytes(48).toString('hex');
const allowedOrigin = process.env.APP_ORIGIN || 'http://localhost:5173';
const serverDirectory = dirname(fileURLToPath(import.meta.url));
const ownerTrialDays = Number(process.env.OWNER_TRIAL_DAYS || 30);
if (!Number.isInteger(ownerTrialDays) || ownerTrialDays < 1 || ownerTrialDays > 365) {
  throw new Error('OWNER_TRIAL_DAYS 1–365 oralig‘idagi butun kun bo‘lishi kerak.');
}

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use((request, response, next) => {
  const limit =
    request.method === 'PATCH' &&
    request.path === '/api/company/profile-picture'
      ? '14mb'
      : '5mb';
  express.json({ limit })(request, response, next);
});
app.use(
  session({
    name: 'yemzor.sid',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 12 * 60 * 60 * 1000,
    },
  })
);

const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error:
      'Ro‘yxatdan o‘tish urinishlari ko‘payib ketdi. Birozdan keyin qayta urinib ko‘ring.',
  },
});
const paymentRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error:
      'Chek yuborish urinishlari ko‘payib ketdi. Birozdan keyin qayta urinib ko‘ring.',
  },
});
const paymentRequestRetentionMs = 72 * 60 * 60 * 1000;
const pendingOwnerVerifications = new Map();
const resetConfirmations = new Set([
  'hisobni tozalash',
  'очистить учётные данные',
  'clear account records',
  '0 ga tushurish',
]);

function isResetConfirmation(value) {
  return (
    typeof value === 'string' &&
    resetConfirmations.has(value.trim().toLocaleLowerCase())
  );
}

function fail(statusCode, message) {
  throw Object.assign(new Error(message), { statusCode });
}

function paymentDecisionLocked(entry, now = Date.now()) {
  if (!['approved', 'rejected'].includes(entry.status)) return false;
  const reviewedAt = Date.parse(entry.reviewedAt || '');
  return (
    Number.isFinite(reviewedAt) && now - reviewedAt >= paymentRequestRetentionMs
  );
}

function configuredTelegramOwners() {
  return (process.env.TELEGRAM_PLATFORM_OWNER_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => /^\d+$/.test(value));
}

function requireTelegramSecret(request, _response, next) {
  const configuredSecret = process.env.TELEGRAM_BOT_SECRET || '';
  const providedSecret = request.get('X-Yemzor-Bot-Secret') || '';
  const valid =
    configuredSecret.length > 0 &&
    Buffer.byteLength(configuredSecret) === Buffer.byteLength(providedSecret) &&
    timingSafeEqual(Buffer.from(configuredSecret), Buffer.from(providedSecret));
  if (!valid)
    return next(
      Object.assign(new Error('Telegram bot authentication failed.'), {
        statusCode: 401,
      })
    );
  next();
}

function requireTelegramOwner(telegramUserId) {
  const allowedOwners = configuredTelegramOwners();
  if (!allowedOwners.length)
    fail(503, 'Telegram platform owner IDs are not configured.');
  if (!allowedOwners.includes(String(telegramUserId)))
    fail(403, 'This action is restricted to platform owners.');
  return String(telegramUserId);
}

function normalizePhoneForMatch(value) {
  const digits = typeof value === 'string' ? value.replace(/\D/g, '') : '';
  const normalized = digits.startsWith('00') ? digits.slice(2) : digits;
  return normalized.length >= 9 ? normalized.slice(-9) : normalized;
}

function telegramLinkFor(database, telegramUserId) {
  return database.telegramLinks.find(
    (link) => link.telegramUserId === String(telegramUserId)
  );
}

function requireTelegramCompanyOwner(database, telegramUserId) {
  const link = telegramLinkFor(database, telegramUserId);
  const user =
    link &&
    database.users.find(
      (entry) =>
        entry.id === link.userId &&
        entry.companyId === link.companyId &&
        entry.role === 'company_owner' &&
        entry.active !== false
    );
  const company =
    user && database.companies.find((entry) => entry.id === user.companyId);
  if (!user || !company)
    fail(403, 'Telegram account is not linked to an active store owner.');
  return { link, user, company };
}

function queueTelegramEvent(database, event) {
  database.telegramOutbox.push({
    id: randomUUID(),
    ...event,
    deliveredTo: [],
    createdAt: new Date().toISOString(),
  });
}

function normalizeLogin(value) {
  return typeof value === 'string'
    ? value.trim().toLocaleLowerCase('en-US')
    : '';
}

function validateEmail(value) {
  const email =
    typeof value === 'string' ? value.trim().toLocaleLowerCase('en-US') : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail(400, 'To‘g‘ri email manzilini kiriting.');
  }
  return email;
}

function validateLogin(value) {
  const login = normalizeLogin(value);
  if (!/^[a-z0-9._-]{3,40}$/.test(login))
    fail(
      400,
      'Login 3–40 ta belgi bo‘lsin; lotin harfi, raqam, nuqta, chiziqcha ishlating.'
    );
  return login;
}

function validatePassword(value) {
  if (typeof value !== 'string' || value.length < 10 || value.length > 200) {
    fail(400, 'Parol kamida 10 ta belgidan iborat bo‘lishi kerak.');
  }
}

function validateName(value, label = 'Ism') {
  const name = typeof value === 'string' ? value.trim() : '';
  if (name.length < 2 || name.length > 80)
    fail(400, `${label} 2–80 ta belgi orasida bo‘lishi kerak.`);
  return name;
}

function validateDate(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)
  ) {
    fail(400, 'Sanani YYYY-MM-DD shaklida kiriting.');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    fail(400, 'Sanani tekshiring.');
  return value;
}

function currentTashkentDate() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function validateRestDay(value) {
  const day = Number(value);
  if (!Number.isInteger(day) || day < 0 || day > 6) {
    fail(400, 'Haftalik dam olish kunini tanlang.');
  }
  return day;
}

function positiveAmount(value, label = 'Summa') {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0)
    fail(400, `${label} musbat butun so‘m bo‘lishi kerak.`);
  return amount;
}

function currentBillingPeriod() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
}

function billingPeriodAt(value) {
  const date = new Date(value || '');
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return year && month ? `${year}-${month}` : null;
}

function platformPriceHistory(database) {
  const history = database.platformSettings?.subscriptionPriceHistory;
  return Array.isArray(history)
    ? history
        .filter(
          (entry) =>
            /^\d{4}-(0[1-9]|1[0-2])$/.test(entry.period) &&
            Number.isSafeInteger(entry.amount) &&
            entry.amount > 0
        )
        .sort((first, second) => first.period.localeCompare(second.period))
    : [];
}

function globalPriceForPeriod(database, period) {
  return (
    platformPriceHistory(database)
      .filter((entry) => entry.period <= period)
      .at(-1) || null
  );
}

function companyBillingStartPeriod(company) {
  return (
    billingPeriodAt(company.trialExpiresAt) ||
    billingPeriodAt(company.createdAt)
  );
}

function subscriptionRateForPeriod(database, company, period) {
  const startPeriod = companyBillingStartPeriod(company);
  const globalPrice = globalPriceForPeriod(database, period);
  if (
    globalPrice &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(period) &&
    (!startPeriod || period >= startPeriod)
  ) {
    return { period, amount: globalPrice.amount };
  }
  return (
    database.subscriptionRates.find(
      (item) => item.companyId === company.id && item.period === period
    ) || null
  );
}

function subscriptionRatesThroughPeriod(database, company, period) {
  const rates = new Map(
    database.subscriptionRates
      .filter(
        (item) => item.companyId === company.id && item.period <= period
      )
      .map((item) => [item.period, item])
  );
  const history = platformPriceHistory(database);
  const globalStart = history[0]?.period;
  const accountStart = companyBillingStartPeriod(company);
  const start = [globalStart, accountStart]
    .filter(Boolean)
    .sort()
    .at(-1);
  if (!start || start > period) return [...rates.values()];

  let [year, month] = start.split('-').map(Number);
  const [lastYear, lastMonth] = period.split('-').map(Number);
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    const currentPeriod = `${year}-${String(month).padStart(2, '0')}`;
    const globalPrice = globalPriceForPeriod(database, currentPeriod);
    if (globalPrice) {
      rates.set(currentPeriod, {
        period: currentPeriod,
        amount: globalPrice.amount,
      });
    }
    if (month === 12) {
      year += 1;
      month = 1;
    } else {
      month += 1;
    }
  }
  return [...rates.values()];
}

function subscriptionStatus(
  database,
  company,
  period = currentBillingPeriod()
) {
  const rates = subscriptionRatesThroughPeriod(database, company, period);
  const currentRate = rates.find((item) => item.period === period) || null;
  const dueBefore = rates
    .filter((item) => item.period < period)
    .reduce((sum, item) => sum + item.amount, 0);
  const dueThroughPeriod = rates.reduce((sum, item) => sum + item.amount, 0);
  const paidThroughPeriod = database.subscriptions
    .filter((item) => item.companyId === company.id && item.period <= period)
    .reduce((sum, item) => sum + item.amount, 0);
  const paidAmount = currentRate
    ? Math.min(currentRate.amount, Math.max(paidThroughPeriod - dueBefore, 0))
    : 0;
  return {
    period,
    requiredAmount: currentRate?.amount || 0,
    paidAmount,
    creditBalance: Math.max(paidThroughPeriod - dueThroughPeriod, 0),
    paidAt:
      database.subscriptions
        .filter(
          (item) => item.companyId === company.id && item.period <= period
        )
        .sort((a, b) => b.paidAt.localeCompare(a.paidAt))[0]?.paidAt || null,
    active: Boolean(
      currentRate &&
        currentRate.amount > 0 &&
        paidThroughPeriod >= dueThroughPeriod
    ),
    amountConfigured: Boolean(currentRate && currentRate.amount > 0),
  };
}

function companyAccessStatus(database, company) {
  const subscription = subscriptionStatus(database, company);
  if (!company.trialExpiresAt) return subscription;
  const expiresAt = company.trialExpiresAt;
  const remainingMs = new Date(expiresAt).getTime() - Date.now();
  const trial = Number.isFinite(remainingMs) && remainingMs > 0;
  return {
    ...subscription,
    active: trial || subscription.active,
    trial: trial && !subscription.active,
    trialExpired: !trial && !subscription.active,
    expiresAt,
    remainingMs: Math.max(remainingMs, 0),
  };
}

function requirePaidSubscription(request, _response, next) {
  try {
    const database = readDatabase();
    const company = requireCompany(request, database);
    const access = companyAccessStatus(database, company);
    if (!access.active) {
      return next(
        Object.assign(
          new Error(
            'Joriy oy uchun obuna to‘lovi tasdiqlanishi kerak.'
          ),
          {
            statusCode: 423,
            subscription: access,
            companyName: company.name,
          }
        )
      );
    }
    next();
  } catch (error) {
    next(error);
  }
}

function validatePhone(value) {
  if (typeof value !== 'string')
    fail(400, 'Telefon raqamini matn shaklida yuboring.');
  const phone = value.trim();
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (!/^[+()\d -]+$/.test(phone) || digits.length < 7 || digits.length > 15) {
    fail(400, 'Telefon raqamini tekshiring: 7–15 ta raqam kiriting.');
  }
  return phone;
}

function validateTelegram(value) {
  const username = typeof value === 'string' ? value.trim() : '';
  if (!username) return 'naziroff1';
  const normalized = username.startsWith('@') ? username.slice(1) : username;
  if (!/^[A-Za-z0-9_]{3,32}$/.test(normalized))
    fail(
      400,
      'Telegram username noto‘g‘ri. @ dan tashqari 3–32 ta lotin harf, raqam yoki pastki chiziq ishlating.'
    );
  return normalized;
}

function generateVerificationCode() {
  return String((randomBytes(4).readUInt32BE(0) % 900000) + 100000);
}

async function sendVerificationEmail(email, code) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const configuredFrom = process.env.SMTP_FROM || '';
  const fromAddress =
    configuredFrom.match(/<([^>]+)>/)?.[1] ||
    configuredFrom.trim() ||
    user;
  const from = { name: 'Yemzor', address: fromAddress };
  if (!host || !user || !pass)
    fail(
      503,
      'Email yuborish xizmati sozlanmagan. Administrator SMTP sozlamalarini to‘ldirishi kerak.'
    );
  try {
    const logo = await readFile(
      resolve(serverDirectory, '../public/yemzor-logo.png')
    );
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    const info = await transporter.sendMail({
      from,
      to: email,
      subject: `${code} — Yemzor tasdiqlash kodi`,
      text: `Yemzor akkauntingizni tasdiqlash kodi (verification code):\n\n${code}\n\nKod 10 daqiqa amal qiladi va bir marta ishlatiladi. Agar siz ro‘yxatdan o‘tishni boshlamagan bo‘lsangiz, bu xatni e’tiborsiz qoldiring.\n\nYemzor jamoasi`,
      html: `<!doctype html>
<html lang="uz">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Yemzor tasdiqlash kodi</title></head>
  <body style="margin:0;padding:32px 12px;background:#f3f6f4;font-family:Arial,Helvetica,sans-serif;color:#26372c;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e4ebe5;border-radius:18px;overflow:hidden;">
      <tr><td style="padding:25px 30px;background:#174b30;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
          <td style="padding-right:11px;vertical-align:middle;"><img src="cid:yemzor-logo" width="44" height="44" alt="Yemzor logosi" style="display:block;width:44px;height:44px;object-fit:contain;background:transparent;"></td>
          <td style="vertical-align:middle;color:#fff;"><strong style="display:block;font-size:19px;line-height:1.3;">Yemzor</strong><span style="display:block;margin-top:3px;color:#c5ddcd;font-size:10px;font-weight:bold;letter-spacing:1px;">SAVDO VA OMBOR BOSHQARUVI</span></td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:32px 30px 12px;">
        <p style="margin:0 0 9px;color:#46815a;font-size:11px;font-weight:bold;letter-spacing:1.2px;">EMAILNI TASDIQLASH</p>
        <h1 style="margin:0;color:#24382b;font-size:25px;line-height:1.3;">Yemzor akkauntingizni tasdiqlang</h1>
        <p style="margin:12px 0 0;color:#68776d;font-size:14px;line-height:1.65;">Yemzor’da ro‘yxatdan o‘tishni boshladingiz. Email manzilingizni tasdiqlash uchun quyidagi kodni kiriting:</p>
      </td></tr>
      <tr><td style="padding:20px 30px 22px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f1f5fb;border-radius:12px;">
          <tr><td style="padding:18px 16px 9px;color:#536578;font-size:12px;">Tasdiqlash kodi</td></tr>
          <tr><td style="padding:0 16px 17px;">
            <table role="presentation" cellspacing="5" cellpadding="0" border="0"><tr>${[...code].map((digit) => `<td align="center" width="34" height="44" style="width:34px;height:44px;border:1px solid #e0e7ed;border-radius:6px;background:#fff;color:#203447;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:bold;">${digit}</td>`).join('')}</tr></table>
            <p style="margin:10px 0 0;color:#203447;font-family:Consolas,Monaco,monospace;font-size:20px;font-weight:bold;letter-spacing:5px;">${code}</p>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 30px 30px;">
        <p style="margin:0;color:#68776d;font-size:13px;line-height:1.65;"><strong>Kod 10 daqiqa amal qiladi.</strong> Uni hech kimga bermang — Yemzor xodimlari sizdan tasdiqlash kodini so‘ramaydi.</p>
        <p style="margin:18px 0 0;color:#87938a;font-size:12px;line-height:1.6;">Agar siz ro‘yxatdan o‘tishni boshlamagan bo‘lsangiz, ushbu xatni e’tiborsiz qoldiring.</p>
      </td></tr>
      <tr><td style="padding:17px 30px;border-top:1px solid #e9eeea;color:#87938a;font-size:11px;">© Yemzor · Do‘kon savdosi va ombor boshqaruvi</td></tr>
    </table>
  </body>
</html>`,
      attachments: [
        {
          filename: 'yemzor-logo.png',
          content: logo,
          contentType: 'image/png',
          cid: 'yemzor-logo',
        },
      ],
    });
    const accepted = info.accepted.some(
      (address) => String(address).toLocaleLowerCase('en-US') === email
    );
    if (!accepted) {
      console.error(
        `[Yemzor email] SMTP recipient not accepted. responseCode=${info.responseCode || 'unknown'}`
      );
      fail(
        502,
        'Email server bu manzilni qabul qilmadi. Emailni tekshirib, qayta urinib ko‘ring.'
      );
    }
    return true;
  } catch (error) {
    if (error.statusCode) throw error;
    console.error(
      `[Yemzor email] Verification mail failed. code=${error.code || 'unknown'} responseCode=${error.responseCode || 'none'} command=${error.command || 'unknown'}`
    );
    if (error.code === 'EAUTH' || error.responseCode === 535) {
      fail(
        503,
        'Email xizmati SMTP login ma’lumotlarini rad etdi. Administrator SMTP_USER va SMTP_PASS sozlamalarini tekshirishi kerak.'
      );
    }
    fail(
      502,
      'Tasdiqlash kodini emailga yuborib bo‘lmadi. Birozdan keyin qayta urinib ko‘ring yoki administratorga murojaat qiling.'
    );
  }
}

function findUniqueLogin(database, login) {
  return database.users.some((user) => user.login === login);
}

function currentUser(request) {
  if (!request.session.userId) return null;
  const user = readDatabase().users.find(
    (entry) => entry.id === request.session.userId && entry.active
  );
  if (user) request.user = user;
  return user || null;
}

function requireAuth(request, _response, next) {
  if (!currentUser(request))
    return next(
      Object.assign(new Error('Avval tizimga kiring.'), { statusCode: 401 })
    );
  next();
}

function requirePlatformAdmin(request, _response, next) {
  if (request.user?.role !== 'platform_admin')
    return next(
      Object.assign(
        new Error('Bu amal faqat platforma egasiga ruxsat etilgan.'),
        { statusCode: 403 }
      )
    );
  next();
}

function requireCompanyUser(request, _response, next) {
  if (!['company_owner', 'manager', 'employee'].includes(request.user?.role)) {
    return next(
      Object.assign(new Error('Bu amal do‘kon akkaunti uchun.'), {
        statusCode: 403,
      })
    );
  }
  next();
}

function requireCompanyOwner(request, _response, next) {
  if (request.user?.role !== 'company_owner') {
    return next(
      Object.assign(
        new Error('Bu amal faqat do‘kon boshlig‘iga ruxsat etilgan.'),
        { statusCode: 403 }
      )
    );
  }
  next();
}

function requireOwnerOrManager(request, _response, next) {
  if (!['company_owner', 'manager'].includes(request.user?.role)) {
    return next(
      Object.assign(
        new Error('Bu amal faqat boshliq yoki menejerga ruxsat etilgan.'),
        { statusCode: 403 }
      )
    );
  }
  next();
}

function requireOwnerOrPlatformAdmin(request, _response, next) {
  if (!['company_owner', 'platform_admin'].includes(request.user?.role)) {
    return next(
      Object.assign(
        new Error(
          'Bu amal faqat boshliq yoki platforma egasiga ruxsat etilgan.'
        ),
        { statusCode: 403 }
      )
    );
  }
  next();
}

function safeUser(user) {
  return {
    id: user.id,
    name: user.name,
    login: user.login,
    role: user.role,
    companyId: user.companyId,
    profileImage: user.profileImage || null,
    monthlySalary: user.monthlySalary || 0,
    restDay: Number.isInteger(user.restDay) ? user.restDay : null,
    startDate: user.startDate || user.createdAt?.slice(0, 10) || null,
  };
}

function companyRecords(database, companyId, collection) {
  return database[collection].filter((item) => item.companyId === companyId);
}

function requireCompany(request, database) {
  const company = database.companies.find(
    (item) => item.id === request.user.companyId
  );
  if (!company) fail(403, 'Do‘kon akkaunti topilmadi yoki faolsizlantirilgan.');
  return company;
}

function ensureUniqueLogin(database, login) {
  if (findUniqueLogin(database, login))
    fail(409, 'Bu login boshqa akkauntda ishlatilgan. Boshqa login tanlang.');
}

app.get('/api/status', (request, response) => {
  const database = readDatabase();
  const user = currentUser(request);
  const company =
    user && ['company_owner', 'manager', 'employee'].includes(user.role)
      ? database.companies.find((item) => item.id === user.companyId)
      : null;
  response.json({
    setupRequired: !database.users.some(
      (user) => user.role === 'platform_admin'
    ),
    user: user ? safeUser(user) : null,
    company: company
      ? {
          id: company.id,
          name: company.name,
          createdAt: company.createdAt || null,
        }
      : null,
    subscription: company ? companyAccessStatus(database, company) : null,
  });
});

app.get('/api/public/settings', (_request, response) => {
  const { phone, telegram } = readDatabase().platformSettings;
  response.json({ phone, telegram: telegram || 'naziroff1' });
});

app.get('/api/public/landing', (_request, response) => {
  const database = readDatabase();
  const ratings = database.customerReviews.filter(
    (review) => Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5
  );
  const activeBrands = database.companies
    .filter(
      (company) =>
        subscriptionStatus(database, company).active
    )
    .map((company) => ({
      name: company.name,
      salesCount: companyRecords(database, company.id, 'sales').length,
    }))
    .sort(
      (first, second) =>
        second.salesCount - first.salesCount ||
        first.name.localeCompare(second.name, 'uz')
    )
    .slice(0, 3)
    .map(({ name }) => name);
  response.json({
    brandCount: database.companies.length,
    companyCount: database.companies.length,
    registrationCount: database.users.filter(
      (user) => user.role !== 'platform_admin'
    ).length,
    satisfactionPercent: ratings.length
      ? Math.round(
          (ratings.reduce((sum, review) => sum + review.rating, 0) /
            ratings.length /
            5) *
            100
        )
      : 0,
    reviewCount: ratings.length,
    reviews: ratings
      .filter(
        (review) =>
          review.rating === 5 &&
          review.publicConsent === true &&
          typeof review.comment === 'string' &&
          review.comment.trim()
      )
      .sort((first, second) =>
        (second.updatedAt || second.createdAt).localeCompare(
          first.updatedAt || first.createdAt
        )
      )
      .slice(0, 3)
      .map(({ rating, comment, authorName }) => ({
        rating,
        comment,
        authorName,
      })),
    verifiedReceiptCount: database.sales.length,
    activeBrands,
  });
});

app.post('/api/setup', registrationLimiter, async (request, response) => {
  const name = validateName(request.body?.name, 'Platforma egasining ismi');
  const login = validateLogin(request.body?.login);
  validatePassword(request.body?.password);
  const passwordHash = await bcrypt.hash(request.body.password, 12);
  const user = await updateDatabase((database) => {
    if (database.users.some((entry) => entry.role === 'platform_admin'))
      fail(409, 'Platforma egasi allaqachon yaratilgan.');
    ensureUniqueLogin(database, login);
    const created = {
      id: randomUUID(),
      name,
      login,
      passwordHash,
      role: 'platform_admin',
      companyId: null,
      monthlySalary: 0,
      active: true,
      createdAt: new Date().toISOString(),
    };
    database.users.push(created);
    return safeUser(created);
  });
  await new Promise((resolve, reject) =>
    request.session.regenerate((error) => (error ? reject(error) : resolve()))
  );
  request.session.userId = user.id;
  response.status(201).json({ user });
});

app.post(
  '/api/company/register/request',
  registrationLimiter,
  async (request, response) => {
    if (request.body?.consent !== true)
      fail(400, 'Davom etish uchun oferta va maxfiylik siyosatiga rozilik bering.');
    const email = validateEmail(request.body?.email);
    validatePassword(request.body?.password);
    if (
      readDatabase().users.some(
        (user) => user.login === email || user.email === email
      )
    )
      fail(409, 'Bu email bilan akkaunt allaqachon yaratilgan. Tizimga kiring.');
    const passwordHash = await bcrypt.hash(request.body.password, 12);
    const code = generateVerificationCode();
    await sendVerificationEmail(email, code);
    pendingOwnerVerifications.set(email, {
      code,
      passwordHash,
      expiresAt: Date.now() + 10 * 60 * 1000,
      attempts: 0,
    });
    response.json({
      email,
      sent: true,
      message: `Tasdiqlash kodi ${email} manziliga yuborildi.`,
    });
  }
);

app.post(
  '/api/company/register/verify',
  registrationLimiter,
  async (request, response) => {
    const email = validateEmail(request.body?.email);
    const code =
      typeof request.body?.code === 'string' ? request.body.code.trim() : '';
    const pending = pendingOwnerVerifications.get(email);
    if (!pending || pending.expiresAt <= Date.now()) {
      pendingOwnerVerifications.delete(email);
      fail(400, 'Kod topilmadi yoki muddati tugadi. Yangi kod so‘rang.');
    }
    if (pending.attempts >= 5) {
      pendingOwnerVerifications.delete(email);
      fail(429, 'Urinishlar tugadi. Yangi tasdiqlash kodi so‘rang.');
    }
    if (code !== pending.code) {
      pending.attempts += 1;
      fail(400, 'Emailga yuborilgan kod noto‘g‘ri.');
    }
    await new Promise((resolve, reject) =>
      request.session.regenerate((error) =>
        error ? reject(error) : resolve()
      )
    );
    request.session.ownerRegistration = {
      email,
      passwordHash: pending.passwordHash,
      consentAccepted: true,
      expiresAt: Date.now() + 30 * 60 * 1000,
    };
    pendingOwnerVerifications.delete(email);
    response.json({ verified: true, email });
  }
);

app.post('/api/company/register', registrationLimiter, async (request, response) => {
  const identity = request.session.ownerRegistration;
  if (!identity || identity.expiresAt <= Date.now()) {
    delete request.session.ownerRegistration;
    fail(400, 'Avval email manzilingizni kod bilan tasdiqlang.');
  }
  if (!identity.consentAccepted)
    fail(400, 'Ro‘yxatdan o‘tish uchun oferta va maxfiylik siyosatiga rozilik bering.');
  const storeName = validateName(request.body?.storeName, 'Do‘kon nomi');
  const ownerName = validateName(request.body?.ownerName, 'Boshliq ismi');
  const phone = validatePhone(request.body?.phone ?? '');
  if (!phone) fail(400, 'Do‘kon boshlig‘ining telefon raqamini kiriting.');
  const result = await updateDatabase((database) => {
    if (
      database.users.some(
        (user) =>
          user.login === identity.email || user.email === identity.email
      )
    )
      fail(409, 'Bu email bilan akkaunt allaqachon yaratilgan. Tizimga kiring.');
    const now = new Date();
    const createdAt = now.toISOString();
    const trialExpiresAt = new Date(
      now.getTime() + ownerTrialDays * 24 * 60 * 60 * 1000
    ).toISOString();
    const companyId = randomUUID();
    const ownerId = randomUUID();
    const company = {
      id: companyId,
      name: storeName,
      ownerId,
      nextReceiptNumber: 0,
      absentDeduction: 0,
      restDayWorkBonusEnabled: false,
      restDayWorkBonusAmount: 0,
      abedPaymentsEnabled: true,
      trialExpiresAt,
      createdAt,
    };
    const owner = {
      id: ownerId,
      name: ownerName,
      login: identity.email,
      email: identity.email,
      phone,
      passwordHash: identity.passwordHash,
      role: 'company_owner',
      companyId,
      monthlySalary: 0,
      active: true,
      createdAt,
    };
    database.companies.push(company);
    database.users.push(owner);
    return {
      user: safeUser(owner),
      company: { id: company.id, name: company.name },
      trialExpiresAt,
    };
  });
  await new Promise((resolve, reject) =>
    request.session.regenerate((error) => (error ? reject(error) : resolve()))
  );
  request.session.userId = result.user.id;
  delete request.session.ownerRegistration;
  response.status(201).json(result);
});

app.post('/api/auth/login', async (request, response) => {
  const login = normalizeLogin(request.body?.login);
  const password = request.body?.password;
  if (!login || typeof password !== 'string')
    fail(400, 'Login va parolni kiriting.');
  const user = readDatabase().users.find(
    (entry) => (entry.login === login || entry.email === login) && entry.active
  );
  if (!user || !(await bcrypt.compare(password, user.passwordHash)))
    fail(401, 'Login yoki parol noto‘g‘ri.');
  const requestedRole = request.body?.role;
  if (
    (requestedRole === 'employee' && user.role !== 'employee') ||
    (requestedRole === 'manager' && user.role !== 'manager') ||
    (requestedRole === 'company_owner' &&
      !['company_owner', 'platform_admin'].includes(user.role))
  ) {
    fail(401, 'Tanlangan kirish turi uchun login yoki parol mos emas.');
  }
  await new Promise((resolve, reject) =>
    request.session.regenerate((error) => (error ? reject(error) : resolve()))
  );
  request.session.userId = user.id;
  response.json({ user: safeUser(user) });
});

app.post(
  '/api/auth/verify',
  requireAuth,
  requireCompanyOwner,
  async (request, response) => {
    const currentPassword = request.body?.currentPassword;
    if (typeof currentPassword !== 'string' || !currentPassword)
      fail(400, 'Joriy parolni kiriting.');
    const account = readDatabase().users.find(
      (entry) => entry.id === request.user.id && entry.active
    );
    if (
      !account ||
      !(await bcrypt.compare(currentPassword, account.passwordHash))
    )
      fail(401, 'Joriy parol noto‘g‘ri.');
    response.status(204).end();
  }
);

app.patch(
  '/api/account/credentials',
  requireAuth,
  requireOwnerOrPlatformAdmin,
  async (request, response) => {
    const currentPassword = request.body?.currentPassword;
    if (typeof currentPassword !== 'string' || !currentPassword)
      fail(400, 'Joriy parolni kiriting.');
    const requestedLogin =
      typeof request.body?.login === 'string' ? request.body.login.trim() : '';
    const login = requestedLogin.includes('@')
      ? validateEmail(requestedLogin)
      : validateLogin(requestedLogin);
    const newPassword = request.body?.newPassword;
    if (newPassword !== undefined && newPassword !== '')
      validatePassword(newPassword);
    const passwordHash =
      typeof newPassword === 'string' && newPassword
        ? await bcrypt.hash(newPassword, 12)
        : null;
    const user = await updateDatabase(async (database) => {
      const account = database.users.find(
        (entry) => entry.id === request.user.id && entry.active
      );
      if (
        !account ||
        !(await bcrypt.compare(currentPassword, account.passwordHash))
      )
        fail(401, 'Joriy parol noto‘g‘ri.');
      if (
        database.users.some(
          (entry) =>
            entry.id !== account.id &&
            (entry.login === login || entry.email === login)
        )
      ) {
        fail(409, 'Bu login boshqa akkauntda ishlatilgan.');
      }
      if (login === account.login && !passwordHash)
        fail(400, 'Yangi login yoki yangi parol kiriting.');
      account.login = login;
      if (login.includes('@')) account.email = login;
      else delete account.email;
      if (passwordHash) account.passwordHash = passwordHash;
      account.updatedAt = new Date().toISOString();
      return safeUser(account);
    });
    response.json({ user });
  }
);

app.patch(
  '/api/company/profile-picture',
  requireAuth,
  requireCompanyOwner,
  async (request, response) => {
    const image = request.body?.image;
    const match =
      typeof image === 'string'
        ? image.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/)
        : null;
    if (!match) fail(400, 'Profil rasmi JPEG formatida bo‘lishi kerak.');
    const imageBytes = Buffer.from(match[1], 'base64');
    if (
      imageBytes.length < 4 ||
      imageBytes.length > 10 * 1024 * 1024 ||
      imageBytes[0] !== 0xff ||
      imageBytes[1] !== 0xd8 ||
      imageBytes[2] !== 0xff
    ) {
      fail(400, 'Profil rasmi yaroqsiz yoki 10 MB dan katta.');
    }
    const user = await updateDatabase((database) => {
      const account = database.users.find(
        (entry) => entry.id === request.user.id && entry.active
      );
      if (!account) fail(404, 'Akkaunt topilmadi.');
      account.profileImage = image;
      return safeUser(account);
    });
    response.json({ user });
  }
);

app.post(
  '/api/company/reset',
  requireAuth,
  requireCompanyOwner,
  requirePaidSubscription,
  async (request, response) => {
    const currentPassword = request.body?.currentPassword;
    if (typeof currentPassword !== 'string' || !currentPassword)
      fail(400, 'Amalni tasdiqlash uchun joriy parolni kiriting.');
    if (!isResetConfirmation(request.body?.confirmation))
      fail(400, 'Tasdiqlash uchun “hisobni tozalash” iborasini aynan kiriting.');
    const result = await updateDatabase(async (database) => {
      const account = database.users.find(
        (entry) => entry.id === request.user.id && entry.active
      );
      if (
        !account ||
        !(await bcrypt.compare(currentPassword, account.passwordHash))
      )
        fail(401, 'Joriy parol noto‘g‘ri.');
      const company = requireCompany(request, database);
      const companyId = company.id;
      const cleared = {};
      for (const collection of [
        'products',
        'sales',
        'receipts',
        'movements',
        'attendance',
        'notifications',
      ]) {
        const before = database[collection].length;
        database[collection] = database[collection].filter(
          (entry) => entry.companyId !== companyId
        );
        cleared[collection] = before - database[collection].length;
      }
      const removedUsers = companyRecords(database, companyId, 'users').filter(
        (user) => ['employee', 'manager'].includes(user.role)
      );
      database.users = database.users.filter(
        (user) => !removedUsers.some((removed) => removed.id === user.id)
      );
      cleared.users = removedUsers.length;
      company.absentDeduction = 0;
      company.restDayWorkBonusEnabled = false;
      company.restDayWorkBonusAmount = 0;
      company.abedPaymentsEnabled = true;
      company.nextReceiptNumber = 0;
      return { cleared };
    });
    response.json({
      ...result,
      message:
        'Do‘konning operatsion ma’lumotlari tozalandi. Egasi va obuna yozuvlari saqlandi.',
    });
  }
);

app.use('/api/internal/telegram', requireTelegramSecret);

app.post('/api/internal/telegram/contact', async (request, response) => {
  const telegramUserId = String(request.body?.telegramUserId || '');
  if (
    !/^\d+$/.test(telegramUserId) ||
    String(request.body?.sharedUserId || '') !== telegramUserId
  ) {
    fail(403, 'Share your own Telegram contact to link a store account.');
  }
  const phone = normalizePhoneForMatch(request.body?.phone);
  if (phone.length < 9) fail(400, 'A valid phone number is required.');
  const linked = await updateDatabase((database) => {
    const user = database.users.find(
      (entry) =>
        entry.role === 'company_owner' &&
        entry.active !== false &&
        normalizePhoneForMatch(entry.phone) === phone
    );
    if (!user) return null;
    const company = database.companies.find(
      (entry) => entry.id === user.companyId
    );
    if (!company) return null;
    database.telegramLinks = database.telegramLinks.filter(
      (entry) =>
        entry.telegramUserId !== telegramUserId &&
        !(entry.userId === user.id && entry.telegramUserId !== telegramUserId)
    );
    const link = {
      telegramUserId,
      chatId: String(request.body?.chatId || telegramUserId),
      userId: user.id,
      companyId: company.id,
      language: 'uz',
      linkedAt: new Date().toISOString(),
    };
    database.telegramLinks.push(link);
    return { link, user: safeUser(user), company };
  });
  if (!linked) return response.json({ linked: false });
  const database = readDatabase();
  response.json({
    linked: true,
    language: linked.link.language,
    user: linked.user,
    company: { id: linked.company.id, name: linked.company.name },
    subscription: companyAccessStatus(database, linked.company),
  });
});

app.get('/api/internal/telegram/session', (request, response) => {
  const telegramUserId = String(request.query.telegramUserId || '');
  const database = readDatabase();
  if (configuredTelegramOwners().includes(telegramUserId)) {
    const preference = database.telegramPreferences.find(
      (entry) => entry.telegramUserId === telegramUserId
    );
    return response.json({
      linked: false,
      admin: true,
      language: preference?.language || 'uz',
    });
  }
  const link = telegramLinkFor(database, telegramUserId);
  if (!link) return response.json({ linked: false });
  const { user, company } = requireTelegramCompanyOwner(
    database,
    telegramUserId
  );
  response.json({
    linked: true,
    language: link.language || 'uz',
    user: safeUser(user),
    company: { id: company.id, name: company.name },
    subscription: companyAccessStatus(database, company),
    paymentSettings: {
      cardNumber: database.platformSettings.paymentCardNumber || '',
      cardHolder: database.platformSettings.paymentCardHolder || '',
    },
  });
});

app.patch('/api/internal/telegram/language', async (request, response) => {
  const telegramUserId = String(request.body?.telegramUserId || '');
  const language = request.body?.language;
  if (!['uz', 'ru', 'en'].includes(language))
    fail(400, 'Unsupported language.');
  const link = await updateDatabase((database) => {
    if (configuredTelegramOwners().includes(telegramUserId)) {
      let preference = database.telegramPreferences.find(
        (entry) => entry.telegramUserId === telegramUserId
      );
      if (!preference) {
        preference = { telegramUserId };
        database.telegramPreferences.push(preference);
      }
      preference.language = language;
      return preference;
    }
    const entry = telegramLinkFor(database, telegramUserId);
    if (!entry) fail(403, 'Telegram account is not linked.');
    entry.language = language;
    return entry;
  });
  response.json({ language: link.language });
});

app.get('/api/internal/telegram/snapshot', (request, response) => {
  const telegramUserId = String(request.query.telegramUserId || '');
  const database = readDatabase();
  const { user, company } = requireTelegramCompanyOwner(
    database,
    telegramUserId
  );
  const subscription = companyAccessStatus(database, company);
  const period = currentBillingPeriod();
  const sales = companyRecords(database, company.id, 'sales').filter(
    (entry) => String(entry.createdAt || '').slice(0, 7) === period
  );
  const receipts = companyRecords(database, company.id, 'receipts').filter(
    (entry) => String(entry.createdAt || '').slice(0, 7) === period
  );
  const movements = companyRecords(database, company.id, 'movements').filter(
    (entry) => entry.period === period
  );
  response.json({
    user: safeUser(user),
    company: { id: company.id, name: company.name },
    subscription,
    period,
    metrics: {
      salesRevenue: sales.reduce((sum, entry) => sum + (entry.total || 0), 0),
      purchaseCost: receipts.reduce(
        (sum, entry) => sum + (entry.total || 0),
        0
      ),
      grossProfit: sales.reduce((sum, entry) => sum + (entry.profit || 0), 0),
      employeePayments: movements.reduce(
        (sum, entry) => sum + (entry.amount || 0),
        0
      ),
      salesCount: sales.length,
    },
    employees: companyRecords(database, company.id, 'users')
      .filter((entry) => entry.role === 'employee')
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        active: entry.active !== false,
      })),
    paymentRequests: database.subscriptionPaymentRequests
      .filter(
        (entry) => entry.companyId === company.id && entry.period === period
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  });
});

app.post(
  '/api/internal/telegram/payment-receipts',
  async (request, response) => {
    const telegramUserId = String(request.body?.telegramUserId || '');
    const receipt =
      typeof request.body?.receipt === 'string' ? request.body.receipt : '';
    const match = receipt.match(
      /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/
    );
    if (!match)
      fail(400, 'Chek rasmi JPG, PNG yoki WEBP formatida bo‘lishi kerak.');
    const receiptBytes = Buffer.from(match[2], 'base64');
    if (!receiptBytes.length || receiptBytes.length > 3 * 1024 * 1024) {
      fail(400, 'Chek rasmi 3 MB dan kichik bo‘lishi kerak.');
    }
    const paymentRequest = await updateDatabase((database) => {
      const { user, company } = requireTelegramCompanyOwner(
        database,
        telegramUserId
      );
      const subscription = subscriptionStatus(database, company);
      if (subscription.active) fail(409, 'Joriy oy uchun to‘lov tasdiqlangan.');
      const amount = Math.max(
        subscription.requiredAmount - subscription.paidAmount,
        0
      );
      if (!amount) fail(409, 'Joriy oy uchun tarif summasi sozlanmagan.');
      if (
        database.subscriptionPaymentRequests.some(
          (entry) =>
            entry.companyId === company.id &&
            entry.period === subscription.period &&
            entry.status === 'pending'
        )
      ) {
        fail(
          409,
          'Ushbu oy uchun to‘lov tasdig‘i allaqachon ko‘rib chiqilmoqda.'
        );
      }
      const entry = {
        id: randomUUID(),
        companyId: company.id,
        companyName: company.name,
        ownerId: user.id,
        ownerName: user.name,
        period: subscription.period,
        amount,
        receipt,
        status: 'pending',
        createdAt: new Date().toISOString(),
        reviewedAt: null,
        reviewedBy: null,
        rejectionReason: '',
      };
      database.subscriptionPaymentRequests.push(entry);
      queueTelegramEvent(database, {
        type: 'payment_submitted',
        targetType: 'platform_owner',
        paymentRequest: entry,
      });
      return entry;
    });
    response.status(201).json({ paymentRequest });
  }
);

app.post('/api/internal/telegram/reset', async (request, response) => {
  const telegramUserId = String(request.body?.telegramUserId || '');
  if (!isResetConfirmation(request.body?.confirmation))
    fail(400, 'Reset confirmation is missing.');
  const result = await updateDatabase((database) => {
    const { user, company } = requireTelegramCompanyOwner(
      database,
      telegramUserId
    );
    if (!companyAccessStatus(database, company).active)
      fail(423, 'Joriy oy uchun obuna to‘lovi tasdiqlanishi kerak.');
    const cleared = {};
    for (const collection of [
      'products',
      'sales',
      'receipts',
      'movements',
      'attendance',
      'notifications',
    ]) {
      const before = database[collection].length;
      database[collection] = database[collection].filter(
        (entry) => entry.companyId !== company.id
      );
      cleared[collection] = before - database[collection].length;
    }
    const removedUsers = companyRecords(database, company.id, 'users').filter(
      (entry) => ['employee', 'manager'].includes(entry.role)
    );
    database.users = database.users.filter(
      (entry) => !removedUsers.some((removed) => removed.id === entry.id)
    );
    cleared.users = removedUsers.length;
    company.absentDeduction = 0;
    company.restDayWorkBonusEnabled = false;
    company.restDayWorkBonusAmount = 0;
    company.abedPaymentsEnabled = true;
    company.nextReceiptNumber = 0;
    return { cleared, ownerId: user.id };
  });
  response.json({
    ...result,
    message: 'Do‘konning operatsion ma’lumotlari tozalandi.',
  });
});

app.patch('/api/internal/telegram/credentials', async (request, response) => {
  const telegramUserId = String(request.body?.telegramUserId || '');
  const requestedLogin =
    typeof request.body?.login === 'string' ? request.body.login.trim() : '';
  const login = requestedLogin.includes('@')
    ? validateEmail(requestedLogin)
    : validateLogin(requestedLogin);
  const newPassword = request.body?.newPassword;
  if (newPassword !== undefined && newPassword !== '')
    validatePassword(newPassword);
  const passwordHash =
    typeof newPassword === 'string' && newPassword
      ? await bcrypt.hash(newPassword, 12)
      : null;
  const user = await updateDatabase((database) => {
    const { user: account } = requireTelegramCompanyOwner(
      database,
      telegramUserId
    );
    if (
      database.users.some(
        (entry) =>
          entry.id !== account.id &&
          (entry.login === login || entry.email === login)
      )
    ) {
      fail(409, 'Bu login boshqa akkauntda ishlatilgan.');
    }
    if (login === account.login && !passwordHash)
      fail(400, 'Yangi login yoki yangi parol kiriting.');
    account.login = login;
    if (login.includes('@')) account.email = login;
    else delete account.email;
    if (passwordHash) account.passwordHash = passwordHash;
    account.updatedAt = new Date().toISOString();
    return safeUser(account);
  });
  response.json({ user });
});

app.patch(
  '/api/internal/telegram/employees/:employeeId',
  async (request, response) => {
    const telegramUserId = String(request.body?.telegramUserId || '');
    if (typeof request.body?.active !== 'boolean')
      fail(400, 'Employee active status must be true or false.');
    const employee = await updateDatabase((database) => {
      const { company } = requireTelegramCompanyOwner(database, telegramUserId);
      if (!companyAccessStatus(database, company).active)
        fail(423, 'Joriy oy uchun obuna to‘lovi tasdiqlanishi kerak.');
      const entry = companyRecords(database, company.id, 'users').find(
        (item) =>
          item.id === request.params.employeeId && item.role === 'employee'
      );
      if (!entry) fail(404, 'Hodim topilmadi.');
      entry.active = request.body.active;
      entry.updatedAt = new Date().toISOString();
      return { id: entry.id, name: entry.name, active: entry.active };
    });
    response.json({ employee });
  }
);

app.get('/api/internal/telegram/admin/snapshot', (request, response) => {
  const telegramUserId = requireTelegramOwner(request.query.telegramUserId);
  const database = readDatabase();
  const companies = database.companies.map((company) => ({
    id: company.id,
    name: company.name,
    ownerName:
      database.users.find(
        (user) => user.companyId === company.id && user.role === 'company_owner'
      )?.name || '',
    subscription: companyAccessStatus(database, company),
    monthlyFee:
      subscriptionRateForPeriod(database, company, currentBillingPeriod())
        ?.amount || 0,
    salesRevenue: companyRecords(database, company.id, 'sales')
      .filter(
        (entry) =>
          String(entry.createdAt || '').slice(0, 7) === currentBillingPeriod()
      )
      .reduce((sum, entry) => sum + (entry.total || 0), 0),
    salesProfit: companyRecords(database, company.id, 'sales')
      .filter(
        (entry) =>
          String(entry.createdAt || '').slice(0, 7) === currentBillingPeriod()
      )
      .reduce((sum, entry) => sum + (entry.profit || 0), 0),
  }));
  const paymentRequests = database.subscriptionPaymentRequests
    .map((entry) => ({
      ...entry,
      companyName:
        database.companies.find((company) => company.id === entry.companyId)
          ?.name || entry.companyName,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  response.json({
    telegramUserId,
    companies,
    paymentRequests,
    subscribers: database.telegramLinks
      .filter((link) =>
        database.users.some(
          (user) => user.id === link.userId && user.active !== false
        )
      )
      .map((link) => ({
        telegramUserId: link.telegramUserId,
        chatId: link.chatId,
        companyId: link.companyId,
        language: link.language || 'uz',
      })),
    platformSettings: {
      cardNumber: database.platformSettings.paymentCardNumber || '',
      cardHolder: database.platformSettings.paymentCardHolder || '',
      monthlySubscriptionPrice:
        platformPriceHistory(database).at(-1)?.amount || 0,
    },
  });
});

app.patch(
  '/api/internal/telegram/admin/payment-requests/:requestId',
  async (request, response) => {
    const telegramUserId = requireTelegramOwner(request.body?.telegramUserId);
    const action = request.body?.action;
    if (!['approve', 'reject'].includes(action))
      fail(400, 'To‘lovni tasdiqlash yoki rad etishni tanlang.');
    const rejectionReason =
      action === 'reject' && typeof request.body?.rejectionReason === 'string'
        ? request.body.rejectionReason.trim().slice(0, 300)
        : '';
    const paymentRequest = await updateDatabase((database) => {
      const entry = database.subscriptionPaymentRequests.find(
        (item) => item.id === request.params.requestId
      );
      if (!entry) fail(404, 'To‘lov so‘rovi topilmadi.');
      if (!database.companies.some((item) => item.id === entry.companyId))
        fail(404, 'To‘lov so‘roviga tegishli do‘kon topilmadi.');
      if (paymentDecisionLocked(entry))
        fail(409, 'To‘lov qarorini 72 soatdan keyin o‘zgartirib bo‘lmaydi.');
      if (action === 'approve') {
        if (
          !database.subscriptions.some(
            (payment) => payment.paymentRequestId === entry.id
          )
        ) {
          database.subscriptions.push({
            id: randomUUID(),
            companyId: entry.companyId,
            period: entry.period,
            amount: entry.amount,
            paidAt: new Date().toISOString(),
            createdBy: `telegram:${telegramUserId}`,
            paymentRequestId: entry.id,
          });
        }
        entry.status = 'approved';
      } else {
        database.subscriptions = database.subscriptions.filter(
          (payment) => payment.paymentRequestId !== entry.id
        );
        entry.status = 'rejected';
        entry.rejectionReason = rejectionReason;
      }
      entry.reviewedAt = new Date().toISOString();
      entry.reviewedBy = `telegram:${telegramUserId}`;
      queueTelegramEvent(database, {
        type: 'payment_reviewed',
        targetType: 'store_owner',
        companyId: entry.companyId,
        paymentRequest: entry,
      });
      return entry;
    });
    response.json({ paymentRequest });
  }
);

app.post(
  '/api/internal/telegram/admin/subscriptions',
  async (request, response) => {
    const telegramUserId = requireTelegramOwner(request.body?.telegramUserId);
    const period =
      typeof request.body?.period === 'string' ? request.body.period : '';
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))
      fail(400, 'Obuna oyini YYYY-MM shaklida kiriting.');
    const payment = await updateDatabase((database) => {
      const company = database.companies.find(
        (item) => item.id === request.body?.companyId
      );
      if (!company) fail(404, 'Kompaniya topilmadi.');
      if (!subscriptionRateForPeriod(database, company, period)) {
        fail(409, 'Avval shu oy uchun kompaniya obuna narxini belgilang.');
      }
      const amount = positiveAmount(request.body?.amount, 'To‘lov');
      const entry = {
        id: randomUUID(),
        companyId: company.id,
        period,
        amount,
        paidAt: new Date().toISOString(),
        createdBy: `telegram:${telegramUserId}`,
      };
      database.subscriptions.push(entry);
      return entry;
    });
    response.status(201).json({ payment });
  }
);

app.patch(
  '/api/internal/telegram/admin/credentials',
  async (request, response) => {
    requireTelegramOwner(request.body?.telegramUserId);
    const login = validateLogin(request.body?.login);
    const newPassword = request.body?.newPassword;
    validatePassword(newPassword);
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const user = await updateDatabase((database) => {
      const account = database.users.find(
        (entry) =>
          entry.companyId === request.body?.companyId &&
          entry.role === 'company_owner'
      );
      if (!account) fail(404, 'Do‘kon egasi topilmadi.');
      if (
        database.users.some(
          (entry) =>
            entry.id !== account.id &&
            (entry.login === login || entry.email === login)
        )
      ) {
        fail(409, 'Bu login boshqa akkauntda ishlatilgan.');
      }
      account.login = login;
      account.passwordHash = passwordHash;
      account.updatedAt = new Date().toISOString();
      return safeUser(account);
    });
    response.json({ user });
  }
);

app.get('/api/internal/telegram/events', async (request, response) => {
  const telegramUserId = String(request.query.telegramUserId || '');
  if (!/^\d+$/.test(telegramUserId)) fail(400, 'Telegram user ID is required.');
  const database = readDatabase();
  const isPlatformOwner = configuredTelegramOwners().includes(telegramUserId);
  const link = telegramLinkFor(database, telegramUserId);
  const events = database.telegramOutbox
    .filter(
      (entry) =>
        !entry.deliveredTo.includes(telegramUserId) &&
        ((entry.targetType === 'platform_owner' && isPlatformOwner) ||
          (entry.targetType === 'store_owner' &&
            link?.companyId === entry.companyId))
    )
    .slice(0, 20);
  response.json({ events });
});

app.post(
  '/api/internal/telegram/events/:eventId/ack',
  async (request, response) => {
    const telegramUserId = String(request.body?.telegramUserId || '');
    if (!/^\d+$/.test(telegramUserId))
      fail(400, 'Telegram user ID is required.');
    await updateDatabase((database) => {
      const event = database.telegramOutbox.find(
        (entry) => entry.id === request.params.eventId
      );
      if (!event) fail(404, 'Telegram event not found.');
      const isPlatformOwner =
        configuredTelegramOwners().includes(telegramUserId);
      const link = telegramLinkFor(database, telegramUserId);
      const authorized =
        (event.targetType === 'platform_owner' && isPlatformOwner) ||
        (event.targetType === 'store_owner' &&
          link?.companyId === event.companyId);
      if (!authorized)
        fail(403, 'Telegram event is not assigned to this account.');
      if (!event.deliveredTo.includes(telegramUserId))
        event.deliveredTo.push(telegramUserId);
    });
    response.status(204).end();
  }
);

app.post(
  '/api/internal/telegram/admin/broadcast',
  async (request, response) => {
    const telegramUserId = requireTelegramOwner(request.body?.telegramUserId);
    const message =
      typeof request.body?.message === 'string'
        ? request.body.message.trim().slice(0, 4000)
        : '';
    if (!message) fail(400, 'Broadcast message cannot be empty.');
    const result = await updateDatabase((database) => {
      const links = database.telegramLinks.filter((link) =>
        database.users.some(
          (user) => user.id === link.userId && user.active !== false
        )
      );
      const now = new Date().toISOString();
      for (const companyId of new Set(links.map((link) => link.companyId))) {
        database.notifications.push({
          id: randomUUID(),
          companyId,
          kind: 'broadcast',
          title: 'Yemzor xabari',
          message,
          date: now.slice(0, 10),
          createdAt: now,
        });
      }
      return { subscribers: links.length };
    });
    response.json({ ...result, sentBy: telegramUserId });
  }
);

app.post('/api/auth/logout', requireAuth, (request, response, next) => {
  request.session.destroy((error) => {
    if (error) return next(error);
    response.clearCookie('yemzor.sid', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    response.status(204).end();
  });
});

app.get(
  '/api/platform/companies',
  requireAuth,
  requirePlatformAdmin,
  (_request, response) => {
    const database = readDatabase();
    const companies = database.companies
      .map((company) => {
        const owner = database.users.find(
          (user) => user.id === company.ownerId
        );
        const employees = companyRecords(database, company.id, 'users').filter(
          (user) => user.role === 'employee'
        );
        const latestSubscription =
          companyRecords(database, company.id, 'subscriptions').sort((a, b) =>
            b.period.localeCompare(a.period)
          )[0] || null;
        return {
          id: company.id,
          name: company.name,
          createdAt: company.createdAt,
          ownerLogin: owner?.login || '',
          ownerPhone: owner?.phone || '',
          employeeCount: employees.length,
          latestSubscription,
          trialExpiresAt: company.trialExpiresAt || null,
          currentRate: subscriptionRateForPeriod(
            database,
            company,
            currentBillingPeriod()
          ),
          currentSubscription: companyAccessStatus(database, company),
        };
      });
    response.json({ companies });
  }
);

app.post(
  '/api/platform/companies',
  requireAuth,
  requirePlatformAdmin,
  async (request, response) => {
    const name = validateName(request.body?.name, 'Do‘kon nomi');
    const ownerName = validateName(request.body?.ownerName, 'Boshliq ismi');
    const ownerPhone = validatePhone(request.body?.phone ?? '');
    const login = validateLogin(request.body?.login);
    validatePassword(request.body?.password);
    const passwordHash = await bcrypt.hash(request.body.password, 12);
    const result = await updateDatabase((database) => {
      ensureUniqueLogin(database, login);
      const now = new Date().toISOString();
      const company = {
        id: randomUUID(),
        name,
        ownerId: randomUUID(),
        nextReceiptNumber: 0,
        absentDeduction: 0,
        restDayWorkBonusEnabled: false,
        restDayWorkBonusAmount: 0,
        abedPaymentsEnabled: true,
        createdAt: now,
      };
      const owner = {
        id: company.ownerId,
        name: ownerName,
        login,
        phone: ownerPhone,
        passwordHash,
        role: 'company_owner',
        companyId: company.id,
        monthlySalary: 0,
        active: true,
        createdAt: now,
      };
      database.companies.push(company);
      database.users.push(owner);
      return {
        id: company.id,
        name: company.name,
        ownerLogin: owner.login,
        createdAt: company.createdAt,
      };
    });
    response.status(201).json({ company: result });
  }
);

app.patch(
  '/api/platform/companies/:companyId/owner-password',
  requireAuth,
  requirePlatformAdmin,
  async (request, response) => {
    validatePassword(request.body?.password);
    const passwordHash = await bcrypt.hash(request.body.password, 12);
    const owner = await updateDatabase((database) => {
      const company = database.companies.find(
        (item) => item.id === request.params.companyId
      );
      if (!company) fail(404, 'Do‘kon topilmadi.');
      const account = database.users.find(
        (user) =>
          user.id === company.ownerId &&
          user.companyId === company.id &&
          user.role === 'company_owner'
      );
      if (!account) fail(404, 'Do‘kon boshlig‘i akkaunti topilmadi.');
      account.passwordHash = passwordHash;
      return { companyId: company.id, login: account.login };
    });
    response.json({ owner });
  }
);

app.post(
  '/api/platform/companies/:companyId/subscriptions',
  requireAuth,
  requirePlatformAdmin,
  async (request, response) => {
    const period =
      typeof request.body?.period === 'string' ? request.body.period : '';
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))
      fail(400, 'Obuna oyini YYYY-MM shaklida kiriting.');
    const payment = await updateDatabase((database) => {
      const company = database.companies.find(
        (item) => item.id === request.params.companyId
      );
      if (!company) fail(404, 'Kompaniya topilmadi.');
      if (!subscriptionRateForPeriod(database, company, period))
        fail(409, 'Avval shu oy uchun kompaniya obuna narxini belgilang.');
      const amount = positiveAmount(request.body?.amount, 'To‘lov');
      const entry = {
        id: randomUUID(),
        companyId: company.id,
        period,
        amount,
        paidAt: new Date().toISOString(),
        createdBy: request.user.id,
      };
      database.subscriptions.push(entry);
      return entry;
    });
    const database = readDatabase();
    const company = database.companies.find(
      (item) => item.id === request.params.companyId
    );
    response
      .status(201)
      .json({ payment, subscription: subscriptionStatus(database, company) });
  }
);

app.patch(
  '/api/platform/subscription-price',
  requireAuth,
  requirePlatformAdmin,
  async (request, response) => {
    const monthlyFee = positiveAmount(
      request.body?.monthlyFee,
      'Umumiy oylik obuna narxi'
    );
    const period = currentBillingPeriod();
    const settings = await updateDatabase((database) => {
      if (!Array.isArray(database.platformSettings.subscriptionPriceHistory)) {
        database.platformSettings.subscriptionPriceHistory = [];
      }
      const current = database.platformSettings.subscriptionPriceHistory
        .filter((entry) => entry.period === period)
        .at(-1);
      if (current) {
        current.amount = monthlyFee;
        current.updatedAt = new Date().toISOString();
        current.updatedBy = request.user.id;
      } else {
        database.platformSettings.subscriptionPriceHistory.push({
          period,
          amount: monthlyFee,
          createdAt: new Date().toISOString(),
          createdBy: request.user.id,
        });
      }
      database.platformSettings.monthlySubscriptionPrice = monthlyFee;
      return {
        monthlySubscriptionPrice: monthlyFee,
        subscriptionPriceEffectivePeriod: period,
      };
    });
    response.json(settings);
  }
);

app.get(
  '/api/platform/settings',
  requireAuth,
  requirePlatformAdmin,
  (_request, response) => {
    response.json(readDatabase().platformSettings);
  }
);

app.post(
  '/api/platform/payment-settings',
  requireAuth,
  requirePlatformAdmin,
  async (request, response) => {
    const rawCardNumber =
      typeof request.body?.paymentCardNumber === 'string'
        ? request.body.paymentCardNumber.trim()
        : '';
    const paymentCardNumber = rawCardNumber.replace(/[\s-]/g, '');
    if (paymentCardNumber && !/^\d{13,19}$/.test(paymentCardNumber)) {
      fail(400, 'Karta raqami 13–19 ta raqamdan iborat bo‘lishi kerak.');
    }
    const paymentCardHolder =
      typeof request.body?.paymentCardHolder === 'string'
        ? request.body.paymentCardHolder.trim()
        : '';
    if (
      paymentCardHolder.length > 80 ||
      [...paymentCardHolder].some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
      })
    ) {
      fail(400, 'Karta egasining ismini tekshiring.');
    }
    const settings = await updateDatabase((database) => {
      database.platformSettings.paymentCardNumber = paymentCardNumber;
      database.platformSettings.paymentCardHolder = paymentCardHolder;
      return database.platformSettings;
    });
    response.json(settings);
  }
);

app.get(
  '/api/subscription/payment-status',
  requireAuth,
  async (request, response) => {
    const database = readDatabase();
    const company = requireCompany(request, database);
    const subscription = subscriptionStatus(database, company);
    const period = subscription.period;
    const paymentRequest =
      database.subscriptionPaymentRequests
        .filter(
          (entry) => entry.companyId === company.id && entry.period === period
        )
        .sort((first, second) =>
          second.createdAt.localeCompare(first.createdAt)
        )[0] || null;
    response.json({
      companyName: company.name,
      subscription,
      dueAmount: Math.max(
        subscription.requiredAmount - subscription.paidAmount,
        0
      ),
      canSubmitPayment: request.user.role === 'company_owner',
      paymentRequest,
      paymentCardNumber: database.platformSettings.paymentCardNumber || '',
      paymentCardHolder: database.platformSettings.paymentCardHolder || '',
      telegram: database.platformSettings.telegram || 'naziroff1',
      phone: database.platformSettings.phone || '',
    });
  }
);

app.post(
  '/api/subscription/payment-requests',
  requireAuth,
  paymentRequestLimiter,
  async (request, response) => {
    const receipt =
      typeof request.body?.receipt === 'string' ? request.body.receipt : '';
    const match = receipt.match(
      /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/
    );
    if (!match)
      fail(400, 'Chek rasmi JPG, PNG yoki WEBP formatida bo‘lishi kerak.');
    const receiptBytes = Buffer.from(match[2], 'base64');
    if (!receiptBytes.length || receiptBytes.length > 3 * 1024 * 1024) {
      fail(400, 'Chek rasmi 3 MB dan kichik bo‘lishi kerak.');
    }
    const paymentRequest = await updateDatabase((database) => {
      const company = requireCompany(request, database);
      if (request.user.role !== 'company_owner')
        fail(403, 'To‘lov tasdig‘ini faqat do‘kon egasi yuborishi mumkin.');
      const subscription = subscriptionStatus(database, company);
      if (subscription.active) fail(409, 'Joriy oy uchun to‘lov tasdiqlangan.');
      const amount = Math.max(
        subscription.requiredAmount - subscription.paidAmount,
        0
      );
      if (!amount) fail(409, 'Joriy oy uchun tarif summasi sozlanmagan.');
      const pending = database.subscriptionPaymentRequests.find(
        (entry) =>
          entry.companyId === company.id &&
          entry.period === subscription.period &&
          entry.status === 'pending'
      );
      if (pending)
        fail(
          409,
          'Ushbu oy uchun to‘lov tasdig‘i allaqachon ko‘rib chiqilmoqda.'
        );
      const entry = {
        id: randomUUID(),
        companyId: company.id,
        companyName: company.name,
        ownerId: request.user.id,
        ownerName: request.user.name,
        period: subscription.period,
        amount,
        receipt,
        status: 'pending',
        createdAt: new Date().toISOString(),
        reviewedAt: null,
        reviewedBy: null,
        rejectionReason: '',
      };
      database.subscriptionPaymentRequests.push(entry);
      queueTelegramEvent(database, {
        type: 'payment_submitted',
        targetType: 'platform_owner',
        paymentRequest: entry,
      });
      return entry;
    });
    response.status(201).json({ paymentRequest });
  }
);

app.get(
  '/api/platform/payment-requests/pending-count',
  requireAuth,
  requirePlatformAdmin,
  async (_request, response) => {
    const paymentRequests = readDatabase().subscriptionPaymentRequests;
    response.json({
      count: paymentRequests.filter((entry) => entry.status === 'pending')
        .length,
    });
  }
);

app.get(
  '/api/platform/payment-requests',
  requireAuth,
  requirePlatformAdmin,
  async (_request, response) => {
    const database = readDatabase();
    const paymentRequests = database.subscriptionPaymentRequests
      .map((entry) => ({
        ...entry,
        companyName:
          database.companies.find((company) => company.id === entry.companyId)
            ?.name || entry.companyName,
      }))
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
    response.json({ paymentRequests });
  }
);

app.patch(
  '/api/platform/payment-requests/:requestId',
  requireAuth,
  requirePlatformAdmin,
  async (request, response) => {
    const action = request.body?.action;
    if (!['approve', 'reject'].includes(action))
      fail(400, 'To‘lovni tasdiqlash yoki rad etishni tanlang.');
    const rejectionReason =
      action === 'reject'
        ? typeof request.body?.rejectionReason === 'string'
          ? request.body.rejectionReason.trim().slice(0, 300)
          : ''
        : '';
    const paymentRequest = await updateDatabase((database) => {
      const entry = database.subscriptionPaymentRequests.find(
        (item) => item.id === request.params.requestId
      );
      if (!entry) fail(404, 'To‘lov so‘rovi topilmadi.');
      const company = database.companies.find(
        (item) => item.id === entry.companyId
      );
      if (!company) fail(404, 'To‘lov so‘roviga tegishli do‘kon topilmadi.');
      if (paymentDecisionLocked(entry))
        fail(409, 'To‘lov qarorini 72 soatdan keyin o‘zgartirib bo‘lmaydi.');
      if (action === 'approve') {
        if (
          !database.subscriptions.some(
            (payment) => payment.paymentRequestId === entry.id
          )
        ) {
          database.subscriptions.push({
            id: randomUUID(),
            companyId: entry.companyId,
            period: entry.period,
            amount: entry.amount,
            paidAt: new Date().toISOString(),
            createdBy: request.user.id,
            paymentRequestId: entry.id,
          });
        }
        entry.status = 'approved';
      } else {
        database.subscriptions = database.subscriptions.filter(
          (payment) => payment.paymentRequestId !== entry.id
        );
        entry.status = 'rejected';
        entry.rejectionReason = rejectionReason;
      }
      entry.reviewedAt = new Date().toISOString();
      entry.reviewedBy = request.user.id;
      queueTelegramEvent(database, {
        type: 'payment_reviewed',
        targetType: 'store_owner',
        companyId: entry.companyId,
        paymentRequest: entry,
      });
      return entry;
    });
    response.json({ paymentRequest });
  }
);

app.patch(
  '/api/platform/settings',
  requireAuth,
  requirePlatformAdmin,
  async (request, response) => {
    const phone = validatePhone(request.body?.phone);
    const telegram = validateTelegram(request.body?.telegram);
    const settings = await updateDatabase((database) => {
      database.platformSettings.phone = phone;
      database.platformSettings.telegram = telegram;
      return database.platformSettings;
    });
    response.json(settings);
  }
);

app.delete(
  '/api/platform/companies/:companyId',
  requireAuth,
  requirePlatformAdmin,
  async (request, response) => {
    const removed = await updateDatabase((database) => {
      const company = database.companies.find(
        (item) => item.id === request.params.companyId
      );
      if (!company) fail(404, 'Do‘kon topilmadi.');
      const companyUsers = companyRecords(database, company.id, 'users');
      const userIds = new Set(companyUsers.map((user) => user.id));
      for (const collection of [
        'products',
        'sales',
        'receipts',
        'movements',
        'subscriptions',
        'subscriptionRates',
        'attendance',
        'notifications',
      ]) {
        database[collection] = database[collection].filter(
          (item) => item.companyId !== company.id
        );
      }
      database.users = database.users.filter((user) => !userIds.has(user.id));
      database.companies = database.companies.filter(
        (item) => item.id !== company.id
      );
      database.customerReviews = database.customerReviews.filter(
        (review) => review.companyId !== company.id
      );
      return { id: company.id, name: company.name };
    });
    response.json({
      company: removed,
      message: `${removed.name} do‘koni va unga tegishli barcha ma’lumotlar o‘chirildi.`,
    });
  }
);

app.get(
  '/api/company/review',
  requireAuth,
  requireCompanyOwner,
  (request, response) => {
    const database = readDatabase();
    const company = requireCompany(request, database);
    response.json({
      review:
        database.customerReviews.find(
          (item) => item.companyId === company.id
        ) || null,
    });
  }
);

app.put(
  '/api/company/review',
  requireAuth,
  requireCompanyOwner,
  requirePaidSubscription,
  async (request, response) => {
    const rating = Number(request.body?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      fail(400, '1 dan 5 gacha yulduzli baho tanlang.');
    const comment =
      typeof request.body?.comment === 'string'
        ? request.body.comment.trim()
        : '';
    if (comment.length < 10 || comment.length > 500)
      fail(400, 'Sharh 10–500 ta belgi orasida bo‘lishi kerak.');
    if (request.body?.publicConsent !== true)
      fail(400, 'Sharhni saytda ko‘rsatishga rozilik bering.');
    const review = await updateDatabase((database) => {
      const company = requireCompany(request, database);
      if (!Array.isArray(database.customerReviews))
        database.customerReviews = [];
      const existing = database.customerReviews.find(
        (item) => item.companyId === company.id
      );
      const now = new Date().toISOString();
      const updated = {
        id: existing?.id || randomUUID(),
        companyId: company.id,
        rating,
        comment,
        authorName: request.user.name,
        publicConsent: true,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      if (existing) Object.assign(existing, updated);
      else database.customerReviews.push(updated);
      return updated;
    });
    response.json({ review });
  }
);

app.get(
  '/api/store',
  requireAuth,
  requireCompanyUser,
  requirePaidSubscription,
  (request, response) => {
    const database = readDatabase();
    const company = requireCompany(request, database);
    const users = companyRecords(database, company.id, 'users').filter(
      (user) => user.active
    );
    const ownMovements = companyRecords(database, company.id, 'movements');
    const isOwnerOrManager = ['company_owner', 'manager'].includes(
      request.user.role
    );
    response.json({
      company: {
        id: company.id,
        name: company.name,
        createdAt: company.createdAt,
        absentDeduction: Number(company.absentDeduction || 0),
        restDayWorkBonusEnabled: Boolean(company.restDayWorkBonusEnabled),
        restDayWorkBonusAmount: Number(company.restDayWorkBonusAmount || 0),
        abedPaymentsEnabled: company.abedPaymentsEnabled !== false,
      },
      products: companyRecords(database, company.id, 'products').filter(
        (product) => product.active !== false
      ),
      sales: companyRecords(database, company.id, 'sales').sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      ),
      receipts: companyRecords(database, company.id, 'receipts'),
      notifications: companyRecords(database, company.id, 'notifications').sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt)
      ),
      movements: isOwnerOrManager
        ? ownMovements
        : ownMovements.filter((item) => item.employeeId === request.user.id),
      attendance: companyRecords(database, company.id, 'attendance').filter(
        (item) => isOwnerOrManager || item.employeeId === request.user.id
      ),
      employees: isOwnerOrManager
        ? users.filter((user) => user.role === 'employee').map(safeUser)
        : users.filter((user) => user.id === request.user.id).map(safeUser),
      managers: isOwnerOrManager
        ? users.filter((user) => user.role === 'manager').map(safeUser)
        : [],
    });
  }
);

app.patch(
  '/api/company/settings',
  requireAuth,
  requireCompanyOwner,
  requirePaidSubscription,
  async (request, response) => {
    const amount = Number(request.body?.absentDeduction);
    if (!Number.isFinite(amount) || amount < 0)
      fail(
        400,
        'Kelmagan kun uchun chegirma 0 yoki musbat son bo‘lishi kerak.'
      );
    const restDayWorkBonusEnabled = request.body?.restDayWorkBonusEnabled;
    const restDayWorkBonusAmount =
      request.body?.restDayWorkBonusAmount === undefined
        ? undefined
        : Number(request.body.restDayWorkBonusAmount);
    const abedPaymentsEnabled = request.body?.abedPaymentsEnabled;
    if (
      restDayWorkBonusEnabled !== undefined &&
      typeof restDayWorkBonusEnabled !== 'boolean'
    )
      fail(400, 'Dam olish kunidagi ish bonusi holatini tanlang.');
    if (
      restDayWorkBonusAmount !== undefined &&
      (!Number.isSafeInteger(restDayWorkBonusAmount) ||
        restDayWorkBonusAmount < 0)
    )
      fail(
        400,
        'Dam olish kunidagi bonus 0 yoki musbat butun so‘m bo‘lishi kerak.'
      );
    if (
      abedPaymentsEnabled !== undefined &&
      typeof abedPaymentsEnabled !== 'boolean'
    )
      fail(400, 'Tushlik to‘lovlari holatini tanlang.');
    const company = await updateDatabase((database) => {
      const current = requireCompany(request, database);
      current.absentDeduction = Math.round(amount);
      if (restDayWorkBonusEnabled !== undefined)
        current.restDayWorkBonusEnabled = restDayWorkBonusEnabled;
      if (restDayWorkBonusAmount !== undefined)
        current.restDayWorkBonusAmount = restDayWorkBonusAmount;
      if (abedPaymentsEnabled !== undefined)
        current.abedPaymentsEnabled = abedPaymentsEnabled;
      return {
        id: current.id,
        name: current.name,
        absentDeduction: current.absentDeduction,
        restDayWorkBonusEnabled: current.restDayWorkBonusEnabled,
        restDayWorkBonusAmount: current.restDayWorkBonusAmount,
        abedPaymentsEnabled: current.abedPaymentsEnabled,
      };
    });
    response.json({ company });
  }
);

app.post(
  '/api/products',
  requireAuth,
  requireOwnerOrManager,
  requirePaidSubscription,
  async (request, response) => {
    const name = validateName(request.body?.name, 'Tovar nomi');
    const unit = request.body?.unit;
    if (!['bag', 'weight', 'liter', 'piece', 'block'].includes(unit))
      fail(400, 'Tovar birligini qop, vazn, litr, dona yoki blokdan tanlang.');
    const quantity = Number(request.body?.quantity);
    const quantityUnit = request.body?.quantityUnit;
    const costPrice = positiveAmount(request.body?.costPrice, 'Tan narx');
    const price = positiveAmount(request.body?.price, 'Sotuv narxi');
    const minimumPrice = positiveAmount(
      request.body?.minimumPrice,
      'Eng past narx'
    );
    if (minimumPrice > price)
      fail(400, 'Eng past narx asosiy narxdan katta bo‘lishi mumkin emas.');
    if (!Number.isFinite(quantity) || quantity <= 0)
      fail(400, 'Tovar miqdori musbat bo‘lishi kerak.');
    if (
      ['bag', 'piece', 'block'].includes(unit) &&
      (quantityUnit !== unit || !Number.isSafeInteger(quantity))
    )
      fail(400, 'Qop, dona va blok miqdori butun son bo‘lishi kerak.');
    if (unit === 'liter' && !['l', 'ml'].includes(quantityUnit))
      fail(400, 'Litr yoki millilitr birligini tanlang.');
    if (unit === 'weight' && !['kg', 'ton'].includes(quantityUnit))
      fail(400, 'Vaznli tovar kirimida kg yoki tonnani tanlang.');
    const threshold = Number(request.body?.lowStockThreshold);
    const thresholdUnit = request.body?.thresholdUnit;
    if (!Number.isFinite(threshold) || threshold < 0)
      fail(400, 'Qoldiq eslatmasi 0 yoki musbat miqdor bo‘lishi kerak.');
    if (
      ['bag', 'piece', 'block'].includes(unit) &&
      (!Number.isSafeInteger(threshold) || thresholdUnit !== unit)
    )
      fail(
        400,
        'Qop, dona va blok eslatmasi butun birliklarda bo‘lishi kerak.'
      );
    if (unit === 'weight' && !['kg', 'ton'].includes(thresholdUnit))
      fail(400, 'Vaznli tovar eslatmasida kg yoki tonnani tanlang.');
    if (unit === 'liter' && !['l', 'ml'].includes(thresholdUnit))
      fail(400, 'Suyuqlik eslatmasida litr yoki millilitrni tanlang.');
    const normalizeQuantity = (amount, measure) =>
      measure === 'ton'
        ? amount * 1000
        : measure === 'ml'
          ? amount / 1000
          : amount;
    const normalizedQuantity = normalizeQuantity(quantity, quantityUnit);
    const lowStockThreshold = normalizeQuantity(threshold, thresholdUnit);
    if (!Number.isFinite(normalizedQuantity))
      fail(400, 'Tovar miqdori juda katta.');
    if (!Number.isFinite(lowStockThreshold))
      fail(400, 'Qoldiq eslatmasi miqdori juda katta.');
    const result = await updateDatabase((database) => {
      const company = requireCompany(request, database);
      if (
        companyRecords(database, company.id, 'products').some(
          (item) =>
            item.active !== false &&
            item.name.toLocaleLowerCase('uz') === name.toLocaleLowerCase('uz')
        )
      ) {
        fail(409, 'Bunday nomdagi tovar allaqachon bor.');
      }
      const now = new Date().toISOString();
      const product = {
        id: randomUUID(),
        companyId: company.id,
        name,
        unit,
        volumeUnit: unit === 'liter' ? quantityUnit : undefined,
        quantity: normalizedQuantity,
        lowStockThreshold,
        lowStockUnit: thresholdUnit,
        costPrice,
        price,
        minimumPrice,
        active: true,
        createdAt: now,
        updatedAt: now,
      };
      database.products.push(product);
      database.receipts.push({
        id: randomUUID(),
        companyId: company.id,
        productId: product.id,
        name,
        unit: unit === 'weight' ? 'kg' : unit,
        quantityUnit: unit === 'liter' ? quantityUnit : unit,
        quantity: normalizedQuantity,
        price: costPrice,
        total: Math.round(normalizedQuantity * costPrice),
        costPrice,
        margin: Math.round(normalizedQuantity * (price - costPrice)),
        createdAt: now,
      });
      return product;
    });
    response.status(201).json({ product: result });
  }
);

app.post(
  '/api/products/:id/stock',
  requireAuth,
  requireOwnerOrManager,
  requirePaidSubscription,
  async (request, response) => {
    const quantity = Number(request.body?.quantity);
    const unit = request.body?.unit;
    const incomingCostPrice =
      request.body?.costPrice === undefined
        ? undefined
        : positiveAmount(request.body.costPrice, 'Tan narx');
    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !['bag', 'kg', 'ton', 'l', 'ml', 'piece', 'block'].includes(unit)
    )
      fail(400, 'Kirim miqdori va birligini tekshiring.');
    if (
      ['bag', 'piece', 'block'].includes(unit) &&
      !Number.isSafeInteger(quantity)
    )
      fail(400, 'Qop, dona va blok miqdori butun son bo‘lishi kerak.');
    const result = await updateDatabase((database) => {
      const company = requireCompany(request, database);
      const product = companyRecords(database, company.id, 'products').find(
        (item) => item.id === request.params.id
      );
      if (!product || product.active === false)
        fail(404, 'Faol tovar topilmadi.');
      const expectedUnits =
        product.unit === 'weight'
          ? ['kg', 'ton']
          : product.unit === 'liter'
            ? ['l', 'ml']
            : [product.unit];
      if (!expectedUnits.includes(unit))
        fail(400, 'Kirim birligi tovarning hisob birligiga mos kelmaydi.');
      const normalizedQuantity =
        unit === 'ton'
          ? quantity * 1000
          : unit === 'ml'
            ? quantity / 1000
            : quantity;
      if (!Number.isFinite(normalizedQuantity))
        fail(400, 'Kirim miqdori juda katta.');
      const nextCostPrice = incomingCostPrice ?? product.costPrice ?? 0;
      if (nextCostPrice <= 0)
        fail(400, 'Kirimdagi tan narx musbat bo‘lishi kerak.');
      const now = new Date().toISOString();
      const currentTotalCost =
        Number(product.costPrice || 0) * Number(product.quantity || 0);
      const incomingTotalCost = nextCostPrice * normalizedQuantity;
      const nextQuantity = Number(product.quantity || 0) + normalizedQuantity;
      product.costPrice =
        nextQuantity > 0
          ? (currentTotalCost + incomingTotalCost) / nextQuantity
          : 0;
      product.quantity += normalizedQuantity;
      product.updatedAt = now;
      database.receipts.push({
        id: randomUUID(),
        companyId: company.id,
        productId: product.id,
        name: product.name,
        unit: product.unit === 'weight' ? 'kg' : product.unit,
        quantityUnit: product.unit === 'liter' ? unit : product.unit,
        quantity: normalizedQuantity,
        price: nextCostPrice,
        total: Math.round(normalizedQuantity * nextCostPrice),
        costPrice: nextCostPrice,
        createdAt: now,
      });
      return product;
    });
    response.json({ product: result });
  }
);

app.patch(
  '/api/products/:id',
  requireAuth,
  requireOwnerOrManager,
  requirePaidSubscription,
  async (request, response) => {
    const { name, price, minimumPrice, costPrice } = request.body || {};
    const result = await updateDatabase((database) => {
      const company = requireCompany(request, database);
      const product = companyRecords(database, company.id, 'products').find(
        (item) => item.id === request.params.id
      );
      if (!product || product.active === false)
        fail(404, 'Faol tovar topilmadi.');
      const nextName =
        name === undefined ? product.name : validateName(name, 'Tovar nomi');
      const nextCostPrice =
        costPrice === undefined
          ? product.costPrice
          : positiveAmount(costPrice, 'Tan narx');
      const nextPrice =
        price === undefined
          ? product.price
          : positiveAmount(price, 'Sotuv narxi');
      const nextMinimum =
        minimumPrice === undefined
          ? product.minimumPrice
          : positiveAmount(minimumPrice, 'Eng past narx');
      if (nextMinimum > nextPrice)
        fail(400, 'Eng past narx asosiy narxdan katta bo‘lishi mumkin emas.');
      if (
        companyRecords(database, company.id, 'products').some(
          (item) =>
            item.active !== false &&
            item.id !== product.id &&
            item.name.toLocaleLowerCase('uz') ===
              nextName.toLocaleLowerCase('uz')
        )
      )
        fail(409, 'Bunday nomdagi tovar mavjud.');
      Object.assign(product, {
        name: nextName,
        costPrice: nextCostPrice,
        price: nextPrice,
        minimumPrice: nextMinimum,
        updatedAt: new Date().toISOString(),
      });
      return product;
    });
    response.json({ product: result });
  }
);

app.delete(
  '/api/products/:id',
  requireAuth,
  requireOwnerOrManager,
  requirePaidSubscription,
  async (request, response) => {
    const product = await updateDatabase((database) => {
      const company = requireCompany(request, database);
      const item = companyRecords(database, company.id, 'products').find(
        (entry) => entry.id === request.params.id && entry.active !== false
      );
      if (!item) fail(404, 'Faol tovar topilmadi.');
      item.active = false;
      item.archivedAt = new Date().toISOString();
      item.updatedAt = item.archivedAt;
      return { id: item.id, name: item.name };
    });
    response.json({
      product,
      message:
        'Tovar faol ombordan olib tashlandi. Eski kirimlar va savdolar tarixda saqlandi.',
    });
  }
);

app.post(
  '/api/sales',
  requireAuth,
  requireCompanyUser,
  requirePaidSubscription,
  async (request, response) => {
    const items = request.body?.items;
    if (!Array.isArray(items) || items.length < 1 || items.length > 100)
      fail(400, 'Chekda 1–100 ta mahsulot bo‘lishi kerak.');
    const normalizedItems = items.map((item) => {
      const productId =
        typeof item?.productId === 'string' ? item.productId : '';
      const quantity = Number(item?.quantity);
      const price = positiveAmount(item?.price, 'Sotuv narxi');
      if (!productId || !Number.isFinite(quantity) || quantity <= 0)
        fail(400, 'Chekdagi tovar yoki miqdor noto‘g‘ri.');
      return {
        productId,
        quantity,
        price,
        quantityUnit:
          typeof item?.quantityUnit === 'string'
            ? item.quantityUnit
            : undefined,
      };
    });
    const result = await updateDatabase((database) => {
      const company = requireCompany(request, database);
      let sellerId = request.user.id;
      if (request.user.role === 'company_owner' && request.body?.sellerId) {
        const seller = companyRecords(database, company.id, 'users').find(
          (user) =>
            user.id === request.body.sellerId &&
            user.role === 'employee' &&
            user.active
        );
        if (!seller) fail(400, 'Tanlangan sotuvchi ushbu do‘konda faol emas.');
        sellerId = seller.id;
      }
      const aggregate = new Map();
      for (const item of normalizedItems)
        aggregate.set(
          item.productId,
          (aggregate.get(item.productId) || 0) + item.quantity
        );
      const products = new Map();
      const lines = normalizedItems.map(
        ({ productId, quantity, price, quantityUnit }) => {
          const product = companyRecords(database, company.id, 'products').find(
            (entry) => entry.id === productId
          );
          if (!product || product.active === false)
            fail(404, 'Faol tovar topilmadi yoki boshqa do‘konga tegishli.');
          if (
            ['bag', 'piece', 'block'].includes(product.unit) &&
            !Number.isSafeInteger(quantity)
          )
            fail(
              400,
              `${product.name}: qop, dona yoki blok soni butun bo‘lishi kerak.`
            );
          const displayedQuantityUnit =
            product.unit === 'liter'
              ? quantityUnit || product.volumeUnit || 'l'
              : product.unit;
          if (
            product.unit === 'liter' &&
            !['l', 'ml'].includes(displayedQuantityUnit)
          )
            fail(400, `${product.name}: litr yoki millilitrni tanlang.`);
          if (price < product.minimumPrice || price > product.price)
            fail(
              400,
              `${product.name}: narx ${product.minimumPrice.toLocaleString('uz-UZ')} so‘mdan kam, ${product.price.toLocaleString('uz-UZ')} so‘mdan oshgan bo‘lishi mumkin emas.`
            );
          if (!products.has(productId)) products.set(productId, product);
          const costPrice = Number(product.costPrice || 0);
          const purchaseCost = Math.round(quantity * costPrice);
          return {
            productId,
            name: product.name,
            unit: product.unit,
            quantityUnit:
              product.unit === 'liter' ? displayedQuantityUnit : product.unit,
            quantity,
            price,
            costPrice,
            cost: purchaseCost,
            profit: Math.round(quantity * price) - purchaseCost,
            lineTotal: Math.round(quantity * price),
          };
        }
      );

      const createdAt = new Date().toISOString();
      const notifications = [];
      for (const [productId, totalQuantity] of aggregate) {
        const product = products.get(productId);
        if (totalQuantity > product.quantity)
          fail(409, `${product.name}: omborda so‘ralgan miqdor yetarli emas.`);
        const previousQuantity = product.quantity;
        product.quantity -= totalQuantity;
        if (product.quantity < 1e-9) product.quantity = 0;
        product.updatedAt = new Date().toISOString();
        const notify = (kind, title, message) => {
          const notification = {
            id: randomUUID(),
            companyId: company.id,
            kind,
            title,
            message,
            date: createdAt.slice(0, 10),
            createdAt,
          };
          database.notifications.push(notification);
          notifications.push(notification);
        };
        if (
          product.lowStockThreshold > 0 &&
          previousQuantity > product.lowStockThreshold &&
          product.quantity <= product.lowStockThreshold
        ) {
          const unit =
            product.lowStockUnit ||
            (product.unit === 'weight'
              ? 'kg'
              : product.unit === 'liter'
                ? 'l'
                : product.unit);
          const displayQuantity =
            unit === 'ton'
              ? product.quantity / 1000
              : unit === 'ml'
                ? product.quantity * 1000
                : product.quantity;
          const unitName =
            {
              bag: 'qop',
              kg: 'kg',
              ton: 'tonna',
              l: 'litr',
              ml: 'ml',
              piece: 'dona',
              block: 'blok',
            }[unit] || unit;
          const remaining = `${displayQuantity.toLocaleString('uz-UZ')} ${unitName}`;
          notify(
            'stock',
            'Tovar qoldig‘i kamaydi',
            `${product.name}: ${remaining} qoldi.`
          );
        }
        if (previousQuantity > 0 && product.quantity === 0) {
          notify(
            'stockout',
            'Tovar tugadi',
            `${product.name}: omborda mahsulot qolmadi.`
          );
        }
      }
      const seller = database.users.find((user) => user.id === sellerId);
      const totalCost = lines.reduce((total, line) => total + line.cost, 0);
      const result = {
        id: randomUUID(),
        companyId: company.id,
        receiptNumber: String(++company.nextReceiptNumber).padStart(6, '0'),
        sellerId,
        sellerName: seller?.name || 'Hodim',
        companyName: company.name,
        items: lines,
        total: lines.reduce((total, line) => total + line.lineTotal, 0),
        purchaseTotal: totalCost,
        profit: lines.reduce((total, line) => total + line.profit, 0),
        createdAt,
      };
      database.sales.push(result);
      return { sale: result, notifications };
    });
    response.status(201).json(result);
  }
);

app.post(
  '/api/employees',
  requireAuth,
  requireCompanyOwner,
  requirePaidSubscription,
  async (request, response) => {
    const deviceApp = request.get('X-Yemzor-Device-App') === '1';
    const name = validateName(request.body?.name, 'Hodim ismi');
    const login = validateLogin(request.body?.login);
    validatePassword(request.body?.password);
    const monthlySalary = positiveAmount(request.body?.monthlySalary, 'Oylik');
    const restDay = validateRestDay(request.body?.restDay);
    const startDate = validateDate(request.body?.startDate);
    if (startDate > currentTashkentDate())
      fail(400, 'Ish boshlash sanasi kelajakda bo‘lishi mumkin emas.');
    const passwordHash = await bcrypt.hash(request.body.password, 12);
    const employee = await updateDatabase((database) => {
      const company = requireCompany(request, database);
      ensureUniqueLogin(database, login);
      const created = {
        id: randomUUID(),
        name,
        login,
        passwordHash,
        role: 'employee',
        companyId: company.id,
        monthlySalary: deviceApp ? 0 : monthlySalary,
        restDay: deviceApp ? null : restDay,
        ...(deviceApp ? {} : { startDate }),
        active: true,
        createdAt: new Date().toISOString(),
      };
      database.users.push(created);
      return safeUser(created);
    });
    response.status(201).json({ employee });
  }
);

app.patch(
  '/api/employees/:id',
  requireAuth,
  requireCompanyOwner,
  requirePaidSubscription,
  async (request, response) => {
    const deviceApp = request.get('X-Yemzor-Device-App') === '1';
    const name = validateName(request.body?.name, 'Hodim ismi');
    const monthlySalary = positiveAmount(request.body?.monthlySalary, 'Oylik');
    const restDay = validateRestDay(request.body?.restDay);
    const startDate = validateDate(request.body?.startDate);
    if (startDate > currentTashkentDate())
      fail(400, 'Ish boshlash sanasi kelajakda bo‘lishi mumkin emas.');
    const employee = await updateDatabase((database) => {
      const company = requireCompany(request, database);
      const user = companyRecords(database, company.id, 'users').find(
        (item) => item.id === request.params.id && item.role === 'employee'
      );
      if (!user) fail(404, 'Hodim topilmadi.');
      Object.assign(user, {
        name,
        monthlySalary: deviceApp ? 0 : monthlySalary,
        restDay: deviceApp ? null : restDay,
        ...(deviceApp ? {} : { startDate }),
      });
      return safeUser(user);
    });
    response.json({ employee });
  }
);

app.delete(
  '/api/employees/:id',
  requireAuth,
  requireCompanyOwner,
  requirePaidSubscription,
  async (request, response) => {
    const deviceApp = request.get('X-Yemzor-Device-App') === '1';
    const removed = await updateDatabase((database) => {
      const company = requireCompany(request, database);
      const employee = companyRecords(database, company.id, 'users').find(
        (user) => user.id === request.params.id && user.role === 'employee'
      );
      if (!employee) fail(404, 'Hodim topilmadi.');
      if (deviceApp) {
        employee.active = false;
        employee.updatedAt = new Date().toISOString();
      } else {
        database.users = database.users.filter(
          (user) => user.id !== employee.id
        );
        database.movements = database.movements.filter(
          (item) => item.employeeId !== employee.id
        );
        database.attendance = database.attendance.filter(
          (item) => item.employeeId !== employee.id
        );
      }
      return { id: employee.id, name: employee.name };
    });
    response.json({
      employee: removed,
      message:
        'Hodim akkaunti, davomat, avans va Abed yozuvlari o‘chirildi. Avvalgi savdo va cheklar saqlandi.',
    });
  }
);

app.put(
  '/api/employees/:id/attendance',
  requireAuth,
  requireOwnerOrManager,
  requirePaidSubscription,
  async (request, response) => {
    const date = validateDate(request.body?.date);
    if (date > currentTashkentDate())
      fail(400, 'Kelajak sanasiga davomat kiritib bo‘lmaydi.');
    const status = request.body?.status;
    if (!['present', 'absent', 'excused'].includes(status))
      fail(400, 'Davomat holati kelgan, kelmagan yoki sababli bo‘lishi kerak.');
    const reason =
      status === 'excused' && typeof request.body?.reason === 'string'
        ? request.body.reason.trim()
        : '';
    if (status === 'excused' && (reason.length < 3 || reason.length > 300)) {
      fail(
        400,
        'Sababli kelmaganlik uchun sababni 3–300 ta belgi bilan yozing.'
      );
    }
    const attendance = await updateDatabase((database) => {
      const company = requireCompany(request, database);
      const employee = companyRecords(database, company.id, 'users').find(
        (user) =>
          user.id === request.params.id &&
          user.role === 'employee' &&
          user.active
      );
      if (!employee) fail(404, 'Faol hodim topilmadi.');
      const startDate = employee.startDate || employee.createdAt?.slice(0, 10);
      if (startDate && date < startDate)
        fail(
          400,
          'Ish boshlash sanasidan oldingi davomatni belgilab bo‘lmaydi.'
        );
      const restDay = Number.isInteger(employee.restDay)
        ? employee.restDay
        : null;
      if (
        status !== 'present' &&
        restDay !== null &&
        new Date(`${date}T00:00:00.000Z`).getUTCDay() === restDay
      ) {
        fail(
          400,
          'Bu xodimning haftalik dam olish kuni; davomat va jarima qayd etilmaydi.'
        );
      }
      const existing = companyRecords(database, company.id, 'attendance').find(
        (item) => item.employeeId === employee.id && item.date === date
      );
      if (existing) {
        existing.status = status;
        existing.reason = reason;
        existing.restDay = restDay;
        existing.updatedAt = new Date().toISOString();
        existing.updatedBy = request.user.id;
        return existing;
      }
      const record = {
        id: randomUUID(),
        companyId: company.id,
        employeeId: employee.id,
        employeeName: employee.name,
        date,
        status,
        reason,
        restDay,
        createdAt: new Date().toISOString(),
        updatedBy: request.user.id,
      };
      database.attendance.push(record);
      return record;
    });
    response.json({ attendance });
  }
);

app.post(
  '/api/employees/:id/movements',
  requireAuth,
  requireOwnerOrManager,
  requirePaidSubscription,
  async (request, response) => {
    const kind = request.body?.kind;
    if (!['advance', 'abed'].includes(kind))
      fail(400, 'To‘lov turi avans yoki Abed bo‘lishi kerak.');
    const amount = positiveAmount(request.body?.amount);
    const period =
      typeof request.body?.period === 'string' ? request.body.period : '';
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))
      fail(400, 'Hisob oyini YYYY-MM shaklida kiriting.');
    const date = validateDate(
      request.body?.date || new Date().toISOString().slice(0, 10)
    );
    if (kind === 'abed' && date.slice(0, 7) !== period)
      fail(400, 'Abed puli oyi uning sanasiga mos bo‘lishi kerak.');
    const entry = await updateDatabase((database) => {
      const company = requireCompany(request, database);
      if (kind === 'abed' && company.abedPaymentsEnabled === false)
        fail(403, 'Tushlik/Abed to‘lovlari hozir o‘chirilgan.');
      const employee = companyRecords(database, company.id, 'users').find(
        (user) => user.id === request.params.id && user.role === 'employee'
      );
      if (!employee) fail(404, 'Hodim topilmadi.');
      const created = {
        id: randomUUID(),
        companyId: company.id,
        employeeId: employee.id,
        employeeName: employee.name,
        kind,
        amount,
        period,
        date,
        createdAt: new Date().toISOString(),
        createdBy: request.user.id,
      };
      database.movements.push(created);
      return created;
    });
    response.status(201).json({ movement: entry });
  }
);

app.get(
  '/api/managers',
  requireAuth,
  requireOwnerOrManager,
  requirePaidSubscription,
  (request, response) => {
    const database = readDatabase();
    const company = requireCompany(request, database);
    const managers = companyRecords(database, company.id, 'users')
      .filter((user) => user.role === 'manager' && user.active)
      .map(safeUser);
    response.json({ managers });
  }
);

app.post(
  '/api/managers',
  requireAuth,
  requireCompanyOwner,
  requirePaidSubscription,
  async (request, response) => {
    const deviceApp = request.get('X-Yemzor-Device-App') === '1';
    const name = validateName(request.body?.name, 'Menejer ismi');
    const login = validateLogin(request.body?.login);
    validatePassword(request.body?.password);
    const monthlySalary = positiveAmount(
      request.body?.monthlySalary ?? 0,
      'Menejer oylik maoshi'
    );
    const passwordHash = await bcrypt.hash(request.body.password, 12);
    const manager = await updateDatabase((database) => {
      const company = requireCompany(request, database);
      ensureUniqueLogin(database, login);
      const created = {
        id: randomUUID(),
        name,
        login,
        passwordHash,
        role: 'manager',
        companyId: company.id,
        monthlySalary: deviceApp ? 0 : monthlySalary,
        active: true,
        createdAt: new Date().toISOString(),
      };
      database.users.push(created);
      return safeUser(created);
    });
    response.status(201).json({ manager });
  }
);

app.patch(
  '/api/managers/:id',
  requireAuth,
  requireCompanyOwner,
  requirePaidSubscription,
  async (request, response) => {
    const deviceApp = request.get('X-Yemzor-Device-App') === '1';
    const name = validateName(request.body?.name, 'Menejer ismi');
    const monthlySalary = positiveAmount(
      request.body?.monthlySalary ?? 0,
      'Menejer oylik maoshi'
    );
    const manager = await updateDatabase((database) => {
      const company = requireCompany(request, database);
      const user = companyRecords(database, company.id, 'users').find(
        (item) => item.id === request.params.id && item.role === 'manager'
      );
      if (!user) fail(404, 'Menejer topilmadi.');
      Object.assign(user, {
        name,
        monthlySalary: deviceApp ? 0 : monthlySalary,
      });
      return safeUser(user);
    });
    response.json({ manager });
  }
);

app.delete(
  '/api/managers/:id',
  requireAuth,
  requireCompanyOwner,
  requirePaidSubscription,
  async (request, response) => {
    const deviceApp = request.get('X-Yemzor-Device-App') === '1';
    const removed = await updateDatabase((database) => {
      const company = requireCompany(request, database);
      const manager = companyRecords(database, company.id, 'users').find(
        (user) => user.id === request.params.id && user.role === 'manager'
      );
      if (!manager) fail(404, 'Menejer topilmadi.');
      if (deviceApp) {
        manager.active = false;
        manager.updatedAt = new Date().toISOString();
      } else {
        database.users = database.users.filter(
          (user) => user.id !== manager.id
        );
      }
      return { id: manager.id, name: manager.name };
    });
    response.json({
      manager: removed,
      message: 'Menejer akkaunti o‘chirildi.',
    });
  }
);

app.get(
  '/api/receipts/:number',
  requireAuth,
  requireCompanyUser,
  requirePaidSubscription,
  (request, response) => {
    const number = request.params.number.replace(/\D/g, '').padStart(6, '0');
    const database = readDatabase();
    const company = requireCompany(request, database);
    const sale = companyRecords(database, company.id, 'sales').find(
      (item) => item.receiptNumber === number
    );
    if (!sale) fail(404, 'Bu raqamli chek ushbu do‘konda topilmadi.');
    response.json({ sale });
  }
);

app.use((error, _request, response, _next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return response
      .status(400)
      .json({ error: 'So‘rov JSON ma’lumotlarini tekshiring.' });
  }
  if ((error.statusCode || 500) >= 500) console.error(error);
  response.status(error.statusCode || 500).json({
    error: error.statusCode
      ? error.message
      : 'Serverda xatolik yuz berdi. Qayta urinib ko‘ring.',
    ...(error.subscription
      ? { subscription: error.subscription, companyName: error.companyName }
      : {}),
  });
});

initializeDatabase()
  .then(() => {
    app.listen(port, process.env.HOST || '0.0.0.0', () =>
      console.log(`Yemzor API http://localhost:${port}  database.json - index.js:3067`)
    );
  })
  .catch((error) => {
    console.error('database.json faylini yuklab bo‘lmadi: - index.js:3071', error);
    process.exitCode = 1;
  });
