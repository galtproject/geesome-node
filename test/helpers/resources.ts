
import fs from "fs";
import {execFileSync} from "child_process";
import helpers from "../../app/helpers.js";
import appHelpers from "../../app/helpers.js";

const resourceNames = [
    'input-image.png',
    'input-image.jpg',
    'test-archive.zip',
    'input-video.mov',
    'not-streamable-input-video.mp4',
    'streamable-input-video.mp4',
    'test-gif.gif'
];

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
        if (!resourceNames.includes(name)) {
            throw new Error(`Unknown test resource: ${name}`);
        }

        execFileSync('bash', [helpers.getCurDir() + '/../bash/prepare-test-resources.sh'], {
            stdio: 'inherit'
        });

        if (!fs.existsSync(dir + name)) {
            throw new Error(`Test resource was not generated: ${name}`);
        }

        return dir + name;
    }
}
