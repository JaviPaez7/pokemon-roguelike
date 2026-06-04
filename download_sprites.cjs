const https = require('https');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'public', 'sprites', 'pokemon');
if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
}

function download(id) {
    const file = fs.createWriteStream(path.join(dir, `${id}.png`));
    https.get(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`, function(response) {
        response.pipe(file);
    });
}

for (let i = 1; i <= 151; i++) {
    download(i);
}
console.log('Download script started.');
