import * as dotenv from 'dotenv';
dotenv.config();
import { chromium } from 'playwright';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';

// ===== CONFIG =====
const MIN_EXP = 0;
const MAX_EXP = 5;
const MAX_JOBS = 50;
const MAX_PAGES = 3;
const DATA_FILE = 'jobs.json';

// 🔐 SET YOUR EMAIL HERE
const EMAIL_USER = 'your_email@gmail.com';
const EMAIL_PASS = 'your_app_password'; // ⚠️ use Gmail App Password

const BASE_URL = `https://www.naukri.com/qa-automation-testing-jobs-in-noida-pune-mumbai-navi-mumbai?jobAge=1&experience=${MIN_EXP}-${MAX_EXP}`;

type Job = {
  title: string;
  company: string;
  location: string;
  experience: string;
  link: string;
};

// ===== FILE HANDLING =====
function loadOldJobs(): Job[] {
  if (fs.existsSync(DATA_FILE)) {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  }
  return [];
}

function saveJobs(jobs: Job[]): void {
  fs.writeFileSync(DATA_FILE, JSON.stringify(jobs, null, 2));
}

function filterNewJobs(oldJobs: Job[], newJobs: Job[]): Job[] {
  const oldLinks = new Set(oldJobs.map(j => j.link));
  return newJobs.filter(j => !oldLinks.has(j.link));
}

// ===== SCRAPER =====
async function scrapeJobs(): Promise<Job[]> {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  let allJobs: Job[] = [];

  for (let i = 1; i <= MAX_PAGES; i++) {
    const url = i === 1 ? BASE_URL : BASE_URL.replace('?', `-${i}?`);

    console.log("Opening Page: " + url);

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    // scroll
    for (let s = 0; s < 8; s++) {
      await page.mouse.wheel(0, 3000);
      await page.waitForTimeout(800);
    }

    const jobs: Job[] = await page.evaluate(() => {
      const cards = document.querySelectorAll('.srp-jobtuple-wrapper, .jobTuple, article.jobTupleHeader');

      return Array.from(cards).map(card => {
        const titleEl = card.querySelector('a.title, a[href*="/job-listings"]');
        return {
          title: (titleEl as HTMLElement)?.innerText.trim() || '',
          company: (card.querySelector('.comp-name, .companyInfo a, [class*="companyInfo"]') as HTMLElement)?.innerText.trim() || '',
          location: (card.querySelector('.locWdth, .location, [class*="location"]') as HTMLElement)?.innerText.trim() || '',
          experience: (card.querySelector('.expwdth, .experience, [class*="experience"]') as HTMLElement)?.innerText.trim() || '',
          link: (titleEl as HTMLAnchorElement)?.href || ''
        };
      });
    });

    console.log("Jobs found: " + jobs.length);
    allJobs.push(...jobs);
  }

  await browser.close();

  // remove duplicates
  const unique = Array.from(new Map(allJobs.map(j => [j.link, j])).values());

  return unique.filter(j => j.title && j.link).slice(0, MAX_JOBS);
}

// ===== EMAIL =====
async function sendEmail(jobs: Job[]) {
  if (jobs.length === 0) {
    console.log("No new jobs");
    return;
  }

  const jobCards = jobs.map(job => `
    <div style="background:#fff;padding:16px;margin-bottom:12px;border-radius:10px;box-shadow:0 2px 6px rgba(0,0,0,0.1);">
      <h3 style="margin:0;color:#0a66c2;">${job.title}</h3>
      <p><b>${job.company}</b></p>
      <p>📍 ${job.location}</p>
      <p>💼 ${job.experience}</p>
      <a href="${job.link}" target="_blank"
        style="display:inline-block;margin-top:8px;padding:8px 12px;background:#0a66c2;color:#fff;border-radius:6px;text-decoration:none;">
        View Job
      </a>
    </div>
  `).join('');

  const html = `
    <div style="font-family:Arial;background:#f4f6f8;padding:20px;">
      <div style="max-width:600px;margin:auto;">
        <h2 style="text-align:center;color:#0a66c2;">QA Jobs (${MIN_EXP}-${MAX_EXP} yrs)</h2>
        <p style="text-align:center;">${jobs.length} new jobs found</p>
        ${jobCards}
        <p style="text-align:center;font-size:12px;color:#777;">Job Bot</p>
      </div>
    </div>
  `;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL,
      pass: process.env.PASS
    }
  });

  await transporter.sendMail({
    from: process.env.EMAIL,
    to: process.env.TO_EMAIL,
    subject: "QA Jobs Alert",
    html: html
  });

  console.log("Email sent");
}

// ===== MAIN =====
(async () => {
  try {
    const oldJobs = loadOldJobs();
    const scraped = await scrapeJobs();
    const newJobs = filterNewJobs(oldJobs, scraped);

    console.log("New jobs: " + newJobs.length);

    await sendEmail(newJobs);
    saveJobs(scraped);

  } catch (e) {
    console.error(e);
  }
})();

