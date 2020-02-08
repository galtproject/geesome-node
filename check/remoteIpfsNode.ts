const DaemonFactory = require('ipfsd-ctl');
const util = require('util');
const IPFS = require('ipfs');

const df = DaemonFactory.create({ type: 'proc' });

(async () => {
  const address = '/ip4/10.135.255.168/tcp/4002/ipfs/Qmf3HmZnuqAqPp1W2uX36zg1XWcbdojpDeGkG5FLqVFQkP';

  //https://github.com/ipfs/js-ipfs/blob/f596b01fc1dab211c898244151017867d182909d/test/core/name-pubsub.js
  const {api: node} = await df.spawn({
    exec: IPFS,
    args: [`--pass toxemia spumones lilied pimento acaleph spumones insulter misdoubt cabbages`, '--enable-namesys-pubsub'],
    preload: { enabled: true }
  });

  node.libp2p.once('peer:connect', async () => {
    console.log('bootstrap.add', address);
    await node.bootstrap.add(address);
    const swarmConnect = util.promisify(node.swarm.connect).bind(node.swarm);
    console.log('swarm.connect', address);
    await swarmConnect(address);
    console.log('Done!');
  })
})();