export const quantity = (v: bigint | number) => '0x' + BigInt(v).toString(16);
export function rpcInteger(value: unknown) {
	if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) {
		throw Error('crypto_rpc_response_invalid');
	}
	return BigInt(value);
}
