import https from 'https';

const urls = [
  'https://raw.githubusercontent.com/k0inwork/scola/main/src/routes/auth.ts',
  'https://raw.githubusercontent.com/k0inwork/scola/main/src/routes/students.ts',
  'https://raw.githubusercontent.com/k0inwork/scola/main/src/lib/validation.ts',
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
