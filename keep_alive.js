const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.send('Bot is alive!');
});

app.listen(8080, '0.0.0.0', () => {
    console.log('Keep-alive server running on port 8080');
});
