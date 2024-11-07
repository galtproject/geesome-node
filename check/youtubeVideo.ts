/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

(async () => {
  const youtubedl: any = await (await import('@microlink/youtube-dl')).default
  youtubedl.getInfo([process.env.URL], function(err, info) {
    if (err) throw err

    console.log('info', info)
  })
})();
