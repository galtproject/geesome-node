
import fs from "fs";
import axios from "axios";
import helpers from "../../app/helpers.js";
import appHelpers from "../../app/helpers.js";

export default {
    getOutputDir() {
        const outputDir = appHelpers.getCurDir() + '/../test/output';
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir);
        }
        return outputDir;
    },
    async prepare(name): Promise<any> {
        const dir = helpers.getCurDir() + '/../test/resources/';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        if (fs.existsSync(dir + name)) {
            return dir + name;
        }
        const hashes = {
            'input-image.png': 'QmSnpR15Bdm3jVQWpmiGqRyqFGqararwGrvi1WdEmZzJRC',
            'input-image.jpg': 'QmSRYP2MaJxT3uHWLDkanQF2Uhi1K2zTf3Ppr5fPdEqsYt',
            'test-archive.zip': 'QmabvdMeL3wb1P71FP2AAnyzbvD9u2sucphtFoQH8vJStN',
            'input-video.mov': 'QmYNiAJyK9ZzQ3DVwRJ7vB3jNuKqumrAZmjyWzaTRMTzxm',
            'not-streamable-input-video.mp4': 'QmYP1UGu9gTQZ5hjG7h7Em2ejQAEpmLWA3cfFg5UkjLYCQ',
            'streamable-input-video.mp4': 'QmWasM9o4RGMvVs1MPxcabw8QAtxanHpmDKv4bMVVfiXSF',
            'test-gif.gif': 'QmNTJLLe4eCYsGybL4NDzGhkWF81QmGLZrRSZscsxm3dtR'
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