const _ = require('lodash');
const childProcess = require("child_process");

module.exports = {
	async getDnsLinkPathFromHost(req) {
		const {host} = req.headers;
		return new Promise((resolve, reject) => {
			childProcess.exec(`dig -t txt ${host.split(':')[0]} +short`, (e, output) => e ? reject(e) : resolve(_.trim(output, '"\n').split('=')[1]));
		}) as Promise<string>;
	}
}