import { chromium } from 'playwright';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import cron from 'node-cron';
import 'dotenv/config';

const BASE_URL =
  'https://www.naukri.com/qa-automation-jobs-in-pune-mumbai-navi-mumbai?jobAge=1';

const MAX_JOBS = 100;
const MAX_PAGES = 3;
const DATA_FILE = 'jobs.json';

type Job = {
  title: string;
  company: string;
  location: string;
  link: string;
};

// 📌 Load previous jobs
function loadOldJobs(): Job[] {
  if (fs.existsSync(DATA_FILE)) {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  }
  return [];
}

// 📌 Save jobs
function saveJobs(jobs: Job[]): void {
  fs.writeFileSync(DATA_FILE, JSON.stringify(jobs, null, 2));
}

// 📌 Remove duplicates
function filterNewJobs(oldJobs: Job[], newJobs: Job[]): Job[] {
  const oldLinks = new Set(oldJobs.map(job => job.link));
  return newJobs.filter(job => !oldLinks.has(job.link));
}

// 🔍 Scraper
async function scrapeJobs(): Promise<Job[]> {
  const browser = await chromium.launch({
    headless: true
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
  });

  const page = await context.newPage();

  let allJobs: Job[] = [];

  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    const pageUrl =
      pageNum === 1
        ? BASE_URL
        : BASE_URL.replace('?jobAge=1', `-${pageNum}?jobAge=1`);

    console.log(`🔎 Page ${pageNum}: ${pageUrl}`);

    await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('a[href*="/job-listings"]', {
      timeout: 15000
    });
    await page.waitForTimeout(3000);
    for (let i = 0; i < 15; i++) {
      await page.mouse.wheel(0, 5000);
      await page.waitForTimeout(1500);
    }
    await page.screenshot({ path: `page-${pageNum}.png`, fullPage: true });
    const jobs: Job[] = await page.evaluate(() => {
      const jobLinks = document.querySelectorAll('a[href*="/job-listings"]');

      return Array.from(jobLinks).map((link) => {
        const parent = link.closest('div');

        return {
          title: (link as HTMLElement).innerText?.trim() || '',
          company:
            (parent?.querySelector('[class*="comp"]') as HTMLElement)?.innerText?.trim() || '',
          location:
            (parent?.querySelector('[class*="loc"]') as HTMLElement)?.innerText?.trim() || '',
          link: (link as HTMLAnchorElement).href
        };
      });
    });

    console.log(`✅ Page ${pageNum}: ${jobs.length} jobs`);

    allJobs.push(...jobs);
  }

  await browser.close();

  const uniqueJobs = Array.from(
    new Map(allJobs.map(job => [job.link, job])).values()
  );

  return uniqueJobs.slice(0, MAX_JOBS);
}

// 📧 Email sender
async function sendEmail(jobs: Job[], type: 'instant' | 'daily') {
  if (jobs.length === 0) {
    console.log("No jobs to send.");
    return;
  }

  const jobList = jobs
    .map(
      (job, i) => `
${i + 1}. ${job.title}
${job.company} | ${job.location}
${job.link}
`
    )
    .join('\n');

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL,
      pass: process.env.PASS
    }
  });

  const subject =
    type === 'instant'
      ? `🚨 New Jobs Found (${jobs.length})`
      : `📊 Daily Job Summary (${jobs.length})`;

  await transporter.sendMail({
    from: process.env.EMAIL,
    to: process.env.TO_EMAIL,
    subject,
    text: jobList
  });

  console.log("📧 Email sent:", type);
}

// 🔁 Main logic
async function main(type: 'instant' | 'daily') {
  try {
    const oldJobs = loadOldJobs();
    const scrapedJobs = await scrapeJobs();
    const newJobs = filterNewJobs(oldJobs, scrapedJobs);

    console.log(`📊 Total scraped: ${scrapedJobs.length}`);
    console.log(`🆕 New jobs: ${newJobs.length}`);

    if (type === 'instant') {
      await sendEmail(newJobs, 'instant');
    } else {
      await sendEmail(scrapedJobs, 'daily');
    }

    saveJobs(scrapedJobs);
  } catch (err) {
    console.error("❌ Error:", err);
  }
}
const type = process.env.RUN_TYPE === 'daily' ? 'daily' : 'instant';

(async () => {
  console.log(`🚀 Running job bot in ${type} mode...`);
  await main(type as 'instant' | 'daily');
})();
