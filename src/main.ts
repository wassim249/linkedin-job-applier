import { launch, Browser, Page, ElementHandle } from "puppeteer";
require("dotenv").config();
import moment from "moment";

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
  LOGGER("APPLICATION STARTED SUCCESSFULLY", MessageType.SUCCESS);
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
      const profilePicture: ElementHandle<Element> | null =
        await tab.waitForSelector(".global-nav__me-photo");

      return profilePicture !== null;
    } catch (error) {
      console.log(error);
      return false;
    }
  };
  const loginSuccess: boolean = await login();
  if (!loginSuccess) {
    LOGGER("LOGIN FAILED", MessageType.ERROR);
    return;
  }
  LOGGER("LOGIN SUCCESS", MessageType.SUCCESS);
  // generate jobs page link
  const jobsPageLink = (): string => {
    const SORT_BY_DATE: boolean = process.env.SORT_BY_DATE == "true";
    let link: string = `https://www.linkedin.com/jobs/search/?f_AL=true${
      SORT_BY_DATE ? "&sortBy=DD" : ""
    }`;

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
  const JOBS_LIMIT: number = parseInt(process.env.JOBS_LIMIT || "100");
  let pagination: number = 0;
  let pageCount: number = 0;
  while (pagination <= JOBS_LIMIT) {
    // go to jobs page
    await tab.goto(jobsPageLink() + (pagination && `&start=${pagination}`));
    pageCount++;
    pagination += 25;

    LOGGER(`PAGE ${pageCount}`, MessageType.INFO);
    // wait for jobs list to be loaded
    await tab.waitForSelector(".jobs-search-results__list");

    //scroll to the end of the page to load all jobs
    await tab.evaluate(async () => {
      let scrollPosition = 0;
      let documentHeight = document.body.scrollHeight;

      while (documentHeight > scrollPosition) {
        window.scrollBy(0, documentHeight);
        await new Promise((resolve) => {
          setTimeout(resolve, 2000);
        });
        scrollPosition = documentHeight;
        documentHeight = document.body.scrollHeight;
      }
      document.body.scrollTop = document.documentElement.scrollTop = 0;
    });

    // get all jobs links
    const getJobLinks: Array<string | null> = await tab.evaluate(
      (): Array<string | null> => {
        console.log(
          document.querySelectorAll(".jobs-search-results__list-item").length
        );
        let fetchedJobsLinks: Array<string | null> = [];
        document
          .querySelectorAll(".job-card-list__title")
          .forEach((link) => fetchedJobsLinks.push(link.getAttribute("href")));
        return fetchedJobsLinks;
      }
    );
    let jobsLinks: Array<string | null> = getJobLinks;
    if (jobsLinks.length == 0) {
      LOGGER(`FAILED TO LOAD JOBS`, MessageType.ERROR);
      process.exit(1);
    }
    LOGGER(`${jobsLinks.length} JOB lOADED`, MessageType.INFO);

    for (const link of jobsLinks) {
      try {
        // open new tab for each job
        const newTab: Page = await browser.newPage();
        await newTab.goto(`${LINKEDIN_URL}/${link}`);
        // wait for job title to be loaded
        await newTab.waitForSelector(".jobs-unified-top-card__job-title");
        // load job title
        const title: string | undefined = await newTab.evaluate(
          (): string | undefined => {
            const title: HTMLElement | null = document.querySelector(
              ".jobs-unified-top-card__job-title"
            );
            return title?.innerText;
          }
        );
        LOGGER(`APPLYING FOR ${title}`, MessageType.INFO);
        // wait and click easy apply button
        try {
          await newTab.waitForSelector(".jobs-apply-button", {
            timeout: 2000,
          });
        } catch (error) {
          // this job already applied
          LOGGER(`${title} ALREADY APPLIED`, MessageType.WARNING);
          newTab.close();
          continue;
        }
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

        try {
          let triesCount: number = 0;
          while (true) {
            if (triesCount >= 12) break;
            // click on next button
            await newTab.click('button[aria-label="Continue to next step');
            // leave 5 seconds to the user so he can answer the questions
            await new Promise((resolve) => {
              triesCount++;
              setTimeout(resolve, 5000);
            });
          }
          if (triesCount >= 12) {
            LOGGER(`1 MIN EXCEEDED FOR : ${title}`, MessageType.WARNING);
            LOGGER(
              `APPLY MANUALLY : ${`${LINKEDIN_URL}/${link}`}`,
              MessageType.INFO
            );
            newTab.close();
            continue;
          }
        } catch (error) {
          try {
            let triesCount: number = 0;
            // click on review my application button
            while (true) {
              if (triesCount >= 12) break;
              await newTab.click(
                'button[aria-label="Review your application"]'
              );
              // leave 5 seconds to the user so he can answer the questions
              await new Promise((resolve) => {
                triesCount++;
                setTimeout(resolve, 5000);
              });
              if (triesCount >= 12) {
                LOGGER(`1 MIN EXCEEDED FOR : ${title}`, MessageType.WARNING);
                LOGGER(
                  `APPLY MANUALLY : ${`${LINKEDIN_URL}${link}`}`,
                  MessageType.INFO
                );
                newTab.close();
                continue;
              }
            }
          } catch (error) {
            try {
              // click on submit the application
              await newTab.click('button[aria-label="Submit application"]');
            } catch (error) {}
          }
        }
        LOGGER(`${title} APPLIED SUCCESSFULLY`, MessageType.SUCCESS);
        // close the tab
        await newTab.close();
      } catch (error) {}
    }
  }
};
(async () => {
  let isConnected: boolean = !!(await require("dns")
    .promises.resolve("google.com")
    .catch(() => {}));
  if (isConnected) start();
  else console.log("Please check your internet connectivity");
})();

enum MessageType {
  SUCCESS = "SUCCESS",
  ERROR = "ERROR",
  WARNING = "WARNING",
  INFO = "INFO",
}

const LOGGER = (value: string, type: MessageType): void => {
  let colors = "\x1b[37m"; // white
  switch (type) {
    case "SUCCESS":
      colors = "\x1b[32m"; // green
      break;
    case "ERROR":
      colors = "\x1b[31m"; // red
      break;
    case "WARNING":
      colors = "\x1b[33m"; // yellow
      break;
    case "INFO":
      colors = "\x1b[36m"; // cyan
      break;
  }
  console.log(colors, `* [${moment().format("YYYY:MM:DD:mm:ss")}] : ${value}`);
};
