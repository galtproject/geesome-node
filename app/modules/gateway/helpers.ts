import _ from 'lodash';
import childProcess from "child_process";
const {trim} = _;

export default {
	async getDnsLinkPathFromHost(host) {
		return new Promise((resolve, reject) => {
			childProcess.exec(`dig -t txt ${host.split(':')[0]} +short`, (e, output) => e ? reject(e) : resolve(trim(output, '"\n').split('=')[1]));
		}) as Promise<string>;
	}
}