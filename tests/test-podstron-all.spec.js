import { test, expect, request } from '@playwright/test';
import fs from 'fs';

test.setTimeout(900000);

const sitemaps = [
  { name: 'BG', url: 'https://vasco-electronics.bg/karta-na-saita' },
  { name: 'CZ', url: 'https://vasco-electronics.cz/mapastranek' },
  { name: 'DK', url: 'https://vasco-translator.dk/sitemap' },
  { name: 'DE', url: 'https://vasco-electronics.de/sitemap' },
  { name: 'UK', url: 'https://vasco-electronics.co.uk/sitemap' },
  { name: 'COM', url: 'https://vasco-translator.com/sitemap' },
  { name: 'ES', url: 'https://traductor-de-voz.es/mapadelsitio' },
  { name: 'FI', url: 'https://vasco-translator.fi/sivukartta' },
  { name: 'BE', url: 'https://vasco-translator.be/fr/plan-du-site' },
  { name: 'FR', url: 'https://vasco-electronics.fr/plan-du-site' },
  { name: 'HR', url: 'https://vasco-translator.hr/mapa-web-mjesta' },
  { name: 'HU', url: 'https://vasco-electronics.hu/oldalterkep' },
  { name: 'IT', url: 'https://vasco-electronics.it/mappa-del-sito' },
  { name: 'LT', url: 'https://vasco-translator.lt/sveitaines-planas' },
  { name: 'NL', url: 'https://vasco-electronics.nl/sitemap' },
  { name: 'PL', url: 'https://vasco-electronics.pl/mapa-strony' },
  { name: 'PT', url: 'https://vasco-translator.pt/mapa-do-site' },
  { name: 'RO', url: 'https://vasco-electronics.ro/harta-site' },
  { name: 'SK', url: 'https://vasco-electronics.sk/mapa-stranky' },
  { name: 'SE', url: 'https://vasco-translator.se/webbplatskarta' }
];

const redirectWhitelist = [
  'https://vasco-electronics.pl/biznes/vasco-audience'
];

const csvRows = [];

for (const sitemap of sitemaps) {

  test(`${sitemap.name} sitemap audit`, async () => {

    const apiContext = await request.newContext({
      userAgent: 'Mozilla/5.0',
      ignoreHTTPSErrors: true
    });

    const sitemapResponse = await apiContext.get(sitemap.url);
    expect(sitemapResponse.ok()).toBeTruthy();

    const sitemapHtml = await sitemapResponse.text();
    const domain = new URL(sitemap.url).origin;

    const linkMatches = [
      ...sitemapHtml.matchAll(new RegExp(`href="(${domain}[^"]+)"`, 'g'))
    ];

    const links = linkMatches.map(m => m[1]);

    const filteredLinks = links.filter(url =>
      !url.endsWith('.pdf') &&
      !url.includes('/themes/') &&
      !url.includes('/assets/')
    );

    const uniqueLinks = [...new Set(filteredLinks)];

    console.log(`\n===== ${sitemap.name} =====`);
    console.log(`Linków: ${uniqueLinks.length}`);

    const statusCounter = {};
    let totalRedirects = 0;

    const problems = {
      noindex: [],
      missingDescription: [],
      missingTitle: [],
      status404: [],
      tooManyRedirects: []
    };

    const criticalErrors = [];

    const concurrency = 5;

    for (let i = 0; i < uniqueLinks.length; i += concurrency) {

      const chunk = uniqueLinks.slice(i, i + concurrency);

      await Promise.allSettled(
        chunk.map(async (url) => {

          let currentUrl = url;
          let redirectCount = 0;
          let response;

          for (let r = 0; r < 5; r++) {

            try {

              response = await apiContext.get(currentUrl, {
                maxRedirects: 0,
                timeout: 20000
              });

            } catch {

              criticalErrors.push(`REQUEST ERROR - ${url}`);
              return;

            }

            const status = response.status();
            statusCounter[status] = (statusCounter[status] || 0) + 1;

            if (status >= 300 && status < 400) {

              const location = response.headers()['location'];

              if (!location) break;

              currentUrl = location.startsWith('http')
                ? location
                : new URL(location, currentUrl).href;

              redirectCount++;
              totalRedirects++;

            } else {

              break;

            }

          }


          const status = response.status();

if (redirectCount === 1 && !redirectWhitelist.includes(url)) {
            problems.redirects.push(url);
            csvRows.push(`${sitemap.name},redirects,${url}`);
          }


          if (redirectCount > 1 && !redirectWhitelist.includes(url)) {
            problems.tooManyRedirects.push(url);
            csvRows.push(`${sitemap.name},too_many_redirects(${redirectCount}),${url}`);
          }

          if (status >= 500) {
            criticalErrors.push(`${status} - ${url}`);
            csvRows.push(`${sitemap.name},server_error,${url}`);
            return;
          }

          if (status === 404) {
            problems.status404.push(url);
            csvRows.push(`${sitemap.name},404,${url}`);
            return;
          }

          if (status !== 200) return;

          const html = await response.text();

          if (!html.includes('<title>')) {
            problems.missingTitle.push(url);
            csvRows.push(`${sitemap.name},missing_title,${url}`);
          }

          if (!html.includes('name="description"')) {
            problems.missingDescription.push(url);
            csvRows.push(`${sitemap.name},missing_meta_description,${url}`);
          }

          const robotsMatch = html.match(
            /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*["']/i
          );

          if (robotsMatch && robotsMatch[0].toLowerCase().includes('noindex')) {
            problems.noindex.push(url);
            csvRows.push(`${sitemap.name},noindex,${url}`);
          }

        })
      );

      await new Promise(r => setTimeout(r, 200));
    }

    console.log('\n--- STATUSY ---');

    Object.entries(statusCounter).forEach(([status, count]) => {
      console.log(`${status}: ${count}`);
    });

    console.log(`Redirecty: ${totalRedirects}`);

    console.log('\n--- PROBLEMY SEO ---');

    if (problems.noindex.length) {
      console.log('\nNOINDEX:');
      problems.noindex.forEach(url => console.log(url));
    }

    if (problems.missingTitle.length) {
      console.log('\nBRAK TITLE:');
      problems.missingTitle.forEach(url => console.log(url));
    }

    if (problems.missingDescription.length) {
      console.log('\nBRAK META DESCRIPTION:');
      problems.missingDescription.forEach(url => console.log(url));
    }

    if (problems.status404.length) {
      console.log('\n404:');
      problems.status404.forEach(url => console.log(url));
    }

    if (problems.tooManyRedirects.length) {
      console.log('\nZA DUŻO REDIRECTÓW:');
      problems.tooManyRedirects.forEach(url => console.log(url));
    }

    if (criticalErrors.length > 0) {

      console.log('\n--- CRITICAL ERRORS ---');

      criticalErrors.forEach(e => console.log(e));

      throw new Error(`${criticalErrors.length} krytycznych błędów w ${sitemap.name}`);

    }

  });

}

test.afterAll(() => {

  const countryStats = {};

  // inicjalizacja wszystkich krajów
  sitemaps.forEach(s => {
    countryStats[s.name] = {
      errors404: 0,
      noindex: 0,
      missingDescription: 0,
      missingTitle: 0,
      redirects: 0,
      totalIssues: 0
    };
  });

  const htmlRows = csvRows.map(row => {

    const [country, typeRaw, url] = row.split(',');

    const type = typeRaw.trim();

    let colorClass = '';

    if (type === '404' || type === 'server_error') {
      countryStats[country].errors404++;
      countryStats[country].totalIssues++;
      colorClass = 'error';
    }

    if (type === 'noindex') {
      countryStats[country].noindex++;
      countryStats[country].totalIssues++;
      colorClass = 'warning';
    }

    if (type === 'missing_meta_description') {
      countryStats[country].missingDescription++;
      countryStats[country].totalIssues++;
      colorClass = 'seo';
    }

    if (type === 'missing_title') {
      countryStats[country].missingTitle++;
      countryStats[country].totalIssues++;
      colorClass = 'seo';
    }

    if (type === 'too_many_redirects') {
      countryStats[country].redirects++;
      countryStats[country].totalIssues++;
      colorClass = 'redirect';
    }

    return `
      <tr class="${colorClass}">
        <td>${country}</td>
        <td>${type}</td>
        <td><a href="${url}" target="_blank">${url}</a></td>
      </tr>
    `;
  }).join('');

  // sortowanie krajów po liczbie problemów
  const sortedCountries = Object.entries(countryStats)
    .sort((a, b) => b[1].totalIssues - a[1].totalIssues);

  const summaryRows = sortedCountries.map(([country, stats]) => {

    return `
      <tr>
        <td>${country}</td>
        <td>${stats.errors404}</td>
        <td>${stats.noindex}</td>
        <td>${stats.missingDescription}</td>
        <td>${stats.missingTitle}</td>
        <td>${stats.redirects}</td>
        <td>${stats.totalIssues}</td>
      </tr>
    `;

  }).join('');

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Sitemap Audit Report</title>

<style>

body{
  font-family: Arial;
  background:#f4f6f8;
  padding:40px;
}

h1{
  margin-bottom:20px;
}

table{
  border-collapse:collapse;
  width:100%;
  background:white;
  margin-bottom:40px;
}

th,td{
  border:1px solid #ddd;
  padding:10px;
}

th{
  background:#222;
  color:white;
}

tr:nth-child(even){
  background:#f9f9f9;
}

.error{
  background:#ffd6d6;
}

.warning{
  background:#ffe7c2;
}

.seo{
  background:#fff7c7;
}

.redirect{
  background:#e6dcff;
}

a{
  color:#0066cc;
}

</style>

</head>

<body>

<h1>Sitemap Audit Report</h1>

<h2>Summary per country</h2>

<table>

<tr>
<th>Country</th>
<th>404</th>
<th>Noindex</th>
<th>Missing meta description</th>
<th>Missing title</th>
<th>Redirects</th>
<th>Total issues</th>
</tr>

${summaryRows}

</table>

<h2>Issues</h2>

<table>

<tr>
<th>Country</th>
<th>Issue</th>
<th>URL</th>
</tr>

${htmlRows}

</table>

</body>
</html>
`;

  fs.writeFileSync('audit-report.html', html);

  console.log('\nRaport HTML zapisany do pliku audit-report.html\n');

});