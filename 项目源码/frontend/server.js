const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// Static files (index.html at root is served first)
app.use(express.static(__dirname, { index: ['index.html'] }));

// Explicitly serve ethers.js library
app.get('/ethers.min.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'node_modules/ethers/dist/ethers.min.js'));
});

app.listen(PORT, () => {
    console.log(`灵可币前端运行中: http://localhost:${PORT}`);
});
