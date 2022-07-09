import { launch, Browser, Page, ElementHandle } from "puppeteer";
require("dotenv").config();

const start = async (): Promise<void> => {
  const LINKEDIN_URL: string = "https://www.linkedin.com";

  const browser: Browser = await launch({
    headless: false,
  });
  const tab: Page = await browser.newPage();
  // load credentials from .env file
  const EMAIL: string = process.env.EMAIL || "";
  const PASSWORD: string = process.env.PASSWORD || "";
  if (!EMAIL || !PASSWORD) {
    console.log("Please set EMAIL and PASSWORD in .env file");
    return;
  }

  // login to linkedin
  const login = async (): Promise<boolean> => {
    try {
      // open linkedin login page
      await tab.goto(`${LINKEDIN_URL}/login`);
      // type email and password
      await tab.type("#username", EMAIL, { delay: 100 });
      await tab.type("#password", PASSWORD, { delay: 100 });
      // submit login form
      await tab.click('button[type="submit"]');
      const header: ElementHandle<Element> | null = await tab.waitForSelector(
        "#global-nav"
      );

      return header !== null;
    } catch (error) {
      console.log(error);
      return false;
    }
  };
  const loginSuccess: boolean = await login();
  if (!loginSuccess) {
    console.log("Login failed");
    return;
  }
};

start();
