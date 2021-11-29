export {};

const fs = require('fs');
const axios = require('axios');

module.exports = {
    async prepare(name) {
        const dir = __dirname + '/../resources/';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        if (fs.existsSync(dir + name)) {
            return dir + name;
        }
        const hashes = {
            'input-image.png': 'QmSnpR15Bdm3jVQWpmiGqRyqFGqararwGrvi1WdEmZzJRC',
            'input-image.jpg': 'QmchuFYLjNxHLrPiQkGnYouDWLxrT1xTpJsr2GT3QDJp21',
            'test-archive.zip': 'QmabvdMeL3wb1P71FP2AAnyzbvD9u2sucphtFoQH8vJStN',
            'input-video.mov': 'QmYNiAJyK9ZzQ3DVwRJ7vB3jNuKqumrAZmjyWzaTRMTzxm',
            'not-streamable-input-video.mp4': 'QmYP1UGu9gTQZ5hjG7h7Em2ejQAEpmLWA3cfFg5UkjLYCQ',
            'streamable-input-video.mp4': 'QmWasM9o4RGMvVs1MPxcabw8QAtxanHpmDKv4bMVVfiXSF',
            'test-gif.gif': 'QmWMx1u1CcNwt79rfKiWHqPQbTJjqB7moiePJVQddUP7PB'
        };
        const writer = fs.createWriteStream(dir + name)

        const response = await axios({
            url: 'https://gateway.ipfs.io/ipfs/' + hashes[name] + '?download=true',
            method: 'GET',
            responseType: 'stream'
        })

        response.data.pipe(writer)

        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(dir + name))
            writer.on('error', reject)
        });
    }
}