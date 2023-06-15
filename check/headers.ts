/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

// usage:
// FIRST=https://geesome.microwavedev.io:2053/ipfs/bafkreiaals5cm4hj6sazor5f4lyevjnm4xy6ier23r7aateldvtoyfadzi SECOND=https://ipfs.io/ipfs/bafkreiaals5cm4hj6sazor5f4lyevjnm4xy6ier23r7aateldvtoyfadzi ./node_modules/.bin/ts-node check/headers.ts

const { exec } = require("child_process");

(async () => {
    const [first, second] = await Promise.all([
        new Promise((resolve, reject) => exec(`curl --head ${process.env.FIRST}`, (e, output) => e ? reject(e) : resolve(output))),
        new Promise((resolve, reject) => exec(`curl --head ${process.env.SECOND}`, (e, output) => e ? reject(e) : resolve(output)))
    ]) as any[];

    const existInFirst = {};
    first.split('\n').sort().map(s => {
        existInFirst[s.toLowerCase()] = true;
    });
    second.split('\n').sort().map(s => {
        if(!existInFirst[s.toLowerCase()]) {
            console.log(s);
        }
    });

    process.exit();
})();
