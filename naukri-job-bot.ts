import { chromium } from 'playwright';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';

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

// 🔍 Scrape jobs
async function scrapeJobs(): Promise<Job[]> {
  const browser = await chromium.launch({
    headless: true // ✅ REQUIRED for GitHub
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

    console.log(`\n🔎 Opening Page ${pageNum}: ${pageUrl}`);

    await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });

    await page.waitForTimeout(6000);

    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, 4000);
      await page.waitForTimeout(1500);
    }

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

    console.log(`✅ Page ${pageNum} jobs found: ${jobs.length}`);

    allJobs.push(...jobs);
  }

  await browser.close();

  const uniqueJobs = Array.from(
    new Map(allJobs.map(job => [job.link, job])).values()
  );

  console.log(`\n📊 Total unique jobs: ${uniqueJobs.length}`);

  return uniqueJobs.slice(0, MAX_JOBS);
}

// 📧 Send email
async function sendEmail(jobs: Job[], type: 'instant' | 'daily'): Promise<void> {
  if (jobs.length === 0) {
    console.log("No new jobs found.");
    return;
  }

  const jobList = jobs
    .map(
      (job, i) => `
${i + 1}. ${job.title}
Company: ${job.company}
Location: ${job.location}
Link: ${job.link}
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

  console.log("📧 Email sent!");
}

// 🚀 Main
(async () => {
  try {
    const type =
      process.env.RUN_TYPE === 'daily' ? 'daily' : 'instant';

    const oldJobs = loadOldJobs();
    const scrapedJobs = await scrapeJobs();
    const newJobs = filterNewJobs(oldJobs, scrapedJobs);

    console.log(`\n🆕 New jobs: ${newJobs.length}`);

    if (type === 'instant') {
      await sendEmail(newJobs, 'instant');
    } else {
      await sendEmail(scrapedJobs, 'daily');
    }

    saveJobs(scrapedJobs);
  } catch (err) {
    console.error("❌ Error:", err);
  }
})();