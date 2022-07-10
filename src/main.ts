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

  // generate jobs page link
  const jobsPageLink = (): string => {
    let link: string = "https://www.linkedin.com/jobs/search/?f_AL=true";
    // load arguments from .env file
    const LOCATION: string | undefined = process.env.LOCATION;
    const POSITION: string | undefined = process.env.POSITION;
    let expericences: string[] = process.env.EXPERIENCES
      ? process.env.EXPERIENCES.split(" ")
      : [];
    let jobTypes: string[] = process.env.JOB_TYPES
      ? process.env.JOB_TYPES.split(" ")
      : [];
    let onSiteOrRemote: string[] = process.env.ON_SITE_OR_REMOTE
      ? process.env.ON_SITE_OR_REMOTE.split(" ")
      : [];
    // check if location and position are set
    if (!LOCATION || !POSITION) {
      console.log("Please set LOCATION, POSITION in .env file");
      process.exit(1);
    }
    // array of linkedin experience levels
    const LINKEDIN_EXPERIENCES: string[] = [
      "Internship",
      "Entry-level",
      "Associate",
      "Mid-Senior",
      "Director",
      "Executive",
    ];

    // array of linkedin on site or remote options
    const LINKEDIN_ON_SITE_OR_REMOTE: string[] = [
      "On-site",
      "Remote",
      "Hybrid",
    ];

    // add experiences to link
    expericences.forEach((exp: string, index: number) => {
      exp = `${LINKEDIN_EXPERIENCES.indexOf(exp) + 1}`;
      link += index == 0 ? `&f_E=${exp}` : `%2C${exp}`;
    });
    // add job types to link
    jobTypes.forEach((jobType: string, index: number) => {
      jobType = jobType[0].toUpperCase();
      link += index == 0 ? `&f_JT=${jobType}` : `%2C${jobType}`;
    });

    // add on site or remote to link
    onSiteOrRemote.forEach((onSiteOrRemote: string, index: number) => {
      onSiteOrRemote = `${
        LINKEDIN_ON_SITE_OR_REMOTE.indexOf(onSiteOrRemote) + 1
      }`;
      link += index == 0 ? `&f_WT=${onSiteOrRemote}` : `%2C${onSiteOrRemote}`;
    });

    // add location and postion to link
    link += `&keywords=${POSITION}&location=${LOCATION}`;

    return link;
  };

  // go to jobs page
  await tab.goto(jobsPageLink());

  // wait for jobs list to be loaded
  await tab.waitForSelector(".jobs-search-results__list");

  //scroll to the end of the page to load all jobs
  await tab.evaluate(async () => {
    let scrollPosition = 0;
    let documentHeight = document.body.scrollHeight;

    while (documentHeight > scrollPosition) {
      window.scrollBy(0, documentHeight);
      await new Promise((resolve) => {
        setTimeout(resolve, 1000);
      });
      scrollPosition = documentHeight;
      documentHeight = document.body.scrollHeight;
    }
  });

  // get all jobs links
  const getJobLinks: Array<string | null> = await tab.evaluate(
    (): Array<string | null> => {
      let fetchedJobsLinks: Array<string | null> = [];
      document
        .querySelectorAll(".job-card-list__title")
        .forEach((link) => fetchedJobsLinks.push(link.getAttribute("href")));
      return fetchedJobsLinks;
    }
  );
  let jobsLinks: Array<string | null> = getJobLinks;
  if (jobsLinks.length == 0) {
    console.log("Failed to load jobs");
    process.exit(1);
  }
  for (const link of jobsLinks) {
    // open new tab for each job
    const newTab: Page = await browser.newPage();
    await newTab.goto(`${LINKEDIN_URL}/${link}`);

    // wait and click easy apply button
    await newTab.waitForSelector(".jobs-apply-button");
    // wait 3sec to easy apply button be activated
    await new Promise((resolve) => {
      setTimeout(resolve, 3000);
    });
    // click easy apply button
    try {
      await newTab.click(".jobs-apply-button");
    } catch (error) {
      // if already applied continue to next job
      continue;
    }

    // close the tab
    await newTab.close();
  }
};

start();
