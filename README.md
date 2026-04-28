# 🚀 Job Automation Bot with Alerts

Automated system that scrapes the latest QA Automation jobs from Naukri and sends email alerts.

---

## 🔥 Features

* Scrapes latest jobs (last 1 day)
* Supports pagination (multiple pages)
* Removes duplicate jobs
* Sends:

  * 🚨 Instant alerts (new jobs)
  * 📊 Daily summary (8 AM)
* Runs on schedule using cron

---

## 🛠 Tech Stack

* TypeScript
* Playwright
* Node.js
* Nodemailer

---

## ⚙️ Setup

### 1. Clone repo

```bash
git clone https://github.com/akashbhade/Job-automation-bot-with-alerts.git
cd Job-automation-bot-with-alerts
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create `.env`

```
EMAIL=your_email@gmail.com
PASS=your_app_password
TO_EMAIL=your_email@gmail.com
```

### 4. Run

```bash
npx ts-node naukri-job-bot.ts
```

---

## ⏰ Scheduling

* Every 30 mins → checks for new jobs
* Daily at 8 AM → sends full summary

---

## 📌 Use Case

Helps automate job search and ensures you never miss new openings.

---

## 👨‍💻 Author

Akash Bhade
