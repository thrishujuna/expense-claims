fetch('http://localhost:5000/api/parse-claim', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-user-id': '3',
  },
  body: JSON.stringify({ raw_text: 'Uber ride to airport 340rs 14 aug' }),
})
  .then(async (res) => {
    const text = await res.text();
    console.log('HTTP', res.status);
    console.log(text);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
