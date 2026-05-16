import https from 'https';

const urls = [
  'https://raw.githubusercontent.com/k0inwork/scola/main/src/db/schema.ts',
  'https://raw.githubusercontent.com/k0inwork/scola/main/src/db/index.ts',
  'https://raw.githubusercontent.com/k0inwork/scola/main/drizzle.config.ts'
];

urls.forEach(url => {
  https.get(url, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`\n\n--- ${url} ---\n`);
      console.log(data);
    });
  });
});
