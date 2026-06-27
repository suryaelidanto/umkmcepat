const urls = [
  "http://localhost:3005/profile",
  ...(process.env.LIGHTHOUSE_AUTH_PROJECT_URL
    ? [
        process.env.LIGHTHOUSE_AUTH_PROJECT_URL.replace(
          "http://localhost:3000",
          "http://localhost:3005",
        ),
      ]
    : []),
];

module.exports = {
  ci: {
    collect: {
      url: urls,
      numberOfRuns: 3,
      chromePath:
        process.env.CHROME_PATH ||
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
      puppeteerScript: "scripts/lighthouse-load-session.cjs",
      puppeteerLaunchOptions: {
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      },
      settings: {
        onlyCategories: [
          "performance",
          "accessibility",
          "best-practices",
          "seo",
        ],
        chromeFlags: "--headless=new --no-sandbox --disable-dev-shm-usage",
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 1 }],
        "categories:best-practices": ["error", { minScore: 1 }],
        "categories:seo": ["error", { minScore: 0.95 }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: ".lighthouseci/auth-mobile",
    },
  },
};
