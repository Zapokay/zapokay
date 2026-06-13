import { execSync } from 'child_process';
import type { Browser } from 'puppeteer-core';

let _browser: Browser | null = null;
let _launchInFlight: Promise<Browser> | null = null;

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
  if (_launchInFlight) return _launchInFlight;

  _launchInFlight = (async () => {
    try {
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

      const browser = await puppeteer.default.launch({
        executablePath,
        args,
        headless: true,
        defaultViewport: { width: 1200, height: 800 },
      });
      _browser = browser;
      return browser;
    } finally {
      _launchInFlight = null;
    }
  })();

  return _launchInFlight;
}

/**
 * Generate a PDF buffer from a self-contained HTML string.
 * Fonts must be loaded via @import inside the HTML <style>.
 */
export async function generatePDF(
  html: string,
  footer?: { docName: string; companyLabel: string; dateLabel: string },
): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      // Footer present (resolutions) → Puppeteer bottom-pinned footer + the
      // smaller top margin (the header now flows in-table via <thead>). Footer
      // absent (e.g. cover page) → unchanged behaviour, including the old margins.
      displayHeaderFooter: !!footer,
      ...(footer
        ? {
            headerTemplate: '<span></span>', // empty — header is in-table (thead)
            footerTemplate: `<div style="width:100%; font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,sans-serif; font-size:9px; color:#A09A93; padding:0.7cm 2.5cm 0; display:flex; align-items:center; justify-content:space-between; border-top:1px solid #E0D9CE;"><span>${footer.docName}</span><span>${footer.companyLabel}</span><span>${footer.dateLabel}</span></div>`,
          }
        : {}),
      margin: { top: footer ? '1.2cm' : '3.5cm', right: '0', bottom: '2cm', left: '0' },
    });

    return Buffer.from(pdf);
  } catch (error) {
    console.error('PDF generation failed:', error);
    throw error;
  } finally {
    await page.close();
  }
}
