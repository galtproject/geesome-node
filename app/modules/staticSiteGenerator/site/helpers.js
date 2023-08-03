import fs from 'fs';
import {resolve as pathResolve, dirname} from 'path';

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
    getFilePath(name) {
        return pathResolve(__dirname, name);
    },
    getFileContent(name) {
        return fs.readFileSync(pathResolve(__dirname, name), {encoding: 'utf8'}).toString();
    }
}