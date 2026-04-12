import { execSync } from 'child_process';
import type { Browser } from 'puppeteer-core';

let _browser: Browser | null = null;

function getLocalChromePath(): string {
  if (process.env.CHROME_EXECUTABLE_PATH) {
    return process.env.CHROME_EXECUTABLE_PATH;
  }

  const macChromePaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];

  for (const p of macChromePaths) {
    try {
      execSync(`test -f "${p}"`);
      return p;
    } catch {}
  }

  // Fallback Linux
  return '/usr/bin/google-chrome-stable';
}

async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.connected) return _browser;

  const puppeteer = await import('puppeteer-core');

  const isVercel =
    !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  let executablePath: string;
  let args: string[];

  if (isVercel) {
    const chromium = await import('@sparticuz/chromium');
    executablePath = await chromium.default.executablePath();
    args = chromium.default.args;
  } else {
    executablePath = getLocalChromePath();
    args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ];
  }

  _browser = await puppeteer.default.launch({
    executablePath,
    args,
    headless: true,
    defaultViewport: { width: 1200, height: 800 },
  });

  return _browser;
}

/**
 * Generate a PDF buffer from a self-contained HTML string.
 * Fonts must be loaded via @import inside the HTML <style>.
 */
export async function generatePDF(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      displayHeaderFooter: false,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    return Buffer.from(pdf);
  } catch (error) {
    console.error('PDF generation failed:', error);
    throw error;
  } finally {
    await page.close();
  }
}
