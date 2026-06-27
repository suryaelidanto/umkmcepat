/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");

const cookiePath = ".lighthouse-auth/cookies.txt";

function parseCookieLines(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const fields = line.split("\t");

      if (fields.length >= 7) {
        const [, , path, secure, expires, name, ...valueParts] = fields;

        return {
          name,
          value: valueParts.join("\t"),
          url: "http://localhost:3005",
          path: path || "/",
          secure: secure.toUpperCase() === "TRUE",
          expires: Number(expires) || undefined,
          sameSite: "Lax",
        };
      }

      const separator = line.indexOf("=");

      if (separator === -1) {
        throw new Error(`Invalid cookie line in ${cookiePath}: ${line}`);
      }

      return {
        name: line.slice(0, separator).trim(),
        value: line.slice(separator + 1).trim(),
        url: "http://localhost:3005",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      };
    });
}

module.exports = async (browser, context) => {
  if (!fs.existsSync(cookiePath)) {
    throw new Error(
      `Missing ${cookiePath}. Create it from DevTools Application > Cookies with authjs/next-auth session cookies.`,
    );
  }

  const cookies = parseCookieLines(fs.readFileSync(cookiePath, "utf8")).filter(
    (cookie) => {
      const name = cookie.name.toLowerCase();
      return name.includes("authjs") || name.includes("next-auth");
    },
  );

  if (!cookies.length) {
    throw new Error(`${cookiePath} has no cookies.`);
  }

  const page = await browser.newPage();
  await page.setCookie(...cookies);
  await page.goto(context.url, { waitUntil: "networkidle0" });
  await page.close();
};
