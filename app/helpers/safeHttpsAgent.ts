import {lookup as dnsLookup} from "node:dns/promises";
import {Agent as HttpsAgent} from "node:https";
import {BlockList, isIP} from "node:net";

const blockedAddresses = getBlockedAddresses();

export type ISafeHttpsAgentOptions = {
	lookup?: typeof dnsLookup;
	errorPrefix?: string;
};

export async function createSafeHttpsAgent(
	hostname: string,
	options: ISafeHttpsAgentOptions = {}
): Promise<HttpsAgent> {
	const errorPrefix = options.errorPrefix || 'outbound_https';
	const addresses = await resolvePublicAddresses(
		hostname,
		options.lookup || dnsLookup,
		errorPrefix
	);
	return new HttpsAgent({
		lookup: getPinnedLookup(hostname, addresses, errorPrefix)
	});
}

async function resolvePublicAddresses(
	hostname: string,
	lookup: typeof dnsLookup,
	errorPrefix: string
) {
	let addresses;
	try {
		addresses = await lookup(stripIpv6Brackets(hostname), {all: true, verbatim: true});
	} catch (error) {
		throw new Error(`${errorPrefix}_dns_failed`);
	}
	if (!addresses.length) {
		throw new Error(`${errorPrefix}_dns_failed`);
	}
	if (addresses.some(({address}) => !isPublicIpAddress(address))) {
		throw new Error(`${errorPrefix}_address_not_allowed`);
	}
	return addresses;
}

function getPinnedLookup(hostname: string, addresses, errorPrefix: string) {
	let nextAddress = 0;
	return (requestedHostname, options, callback) => {
		if (stripIpv6Brackets(requestedHostname).toLowerCase() !== stripIpv6Brackets(hostname).toLowerCase()) {
			callback(new Error(`${errorPrefix}_host_changed`));
			return;
		}
		const family = typeof options === 'object' ? options.family : 0;
		const matchingAddresses = family ? addresses.filter(address => address.family === family) : addresses;
		if (!matchingAddresses.length) {
			callback(new Error(`${errorPrefix}_address_family_unavailable`));
			return;
		}
		if (typeof options === 'object' && options.all) {
			callback(null, matchingAddresses);
			return;
		}
		const selectedAddress = matchingAddresses[nextAddress % matchingAddresses.length];
		nextAddress += 1;
		callback(null, selectedAddress.address, selectedAddress.family);
	};
}

function isPublicIpAddress(address: string): boolean {
	const family = isIP(address);
	if (!family) {
		return false;
	}
	if (blockedAddresses.check(address, family === 4 ? 'ipv4' : 'ipv6')) {
		return false;
	}
	return family === 4 || isGlobalIpv6Address(address.toLowerCase());
}

function isGlobalIpv6Address(address: string): boolean {
	const firstGroup = Number.parseInt(address.split(':')[0], 16);
	return firstGroup >= 0x2000 && firstGroup <= 0x3fff;
}

function getBlockedAddresses(): BlockList {
	const blockList = new BlockList();
	[
		['0.0.0.0', 8],
		['10.0.0.0', 8],
		['100.64.0.0', 10],
		['127.0.0.0', 8],
		['169.254.0.0', 16],
		['172.16.0.0', 12],
		['192.0.0.0', 24],
		['192.0.2.0', 24],
		['192.88.99.0', 24],
		['192.168.0.0', 16],
		['198.18.0.0', 15],
		['198.51.100.0', 24],
		['203.0.113.0', 24],
		['224.0.0.0', 4],
		['240.0.0.0', 4]
	].forEach(([address, prefix]) => blockList.addSubnet(String(address), Number(prefix), 'ipv4'));
	[
		['::', 128],
		['::1', 128],
		['64:ff9b:1::', 48],
		['100::', 64],
		['2001::', 23],
		['2002::', 16],
		['fc00::', 7],
		['fe80::', 10],
		['ff00::', 8]
	].forEach(([address, prefix]) => blockList.addSubnet(String(address), Number(prefix), 'ipv6'));
	return blockList;
}

function stripIpv6Brackets(hostname: string): string {
	return hostname.replace(/^\[|\]$/g, '');
}
