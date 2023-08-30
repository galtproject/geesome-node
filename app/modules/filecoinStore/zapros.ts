import axios, { AxiosResponse } from 'axios';

const LOTUS_ENDPOINT: string = 'http://127.0.0.1:1234/rpc/v0';
const TOKEN: string = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJBbGxvdyI6WyJyZWFkIiwid3JpdGUiLCJzaWduIiwiYWRtaW4iXX0.UIFVzS-t31nrororoororoot@rororoororrrrrorrrrrrrrrorrrroot@geesroot@geesomeroot@geeroororoorrrrrrroorroroot@geesome-test-2:~/geesome-node/.docker-data/lotus#';

interface RPCPayload {
    id: number;
    jsonrpc: string;
    method: string;
    params: any[];
}

async function makeRPCRequest(method: string, params: any[]): Promise<AxiosResponse> {
    const payload: RPCPayload = {
        id: 1,
        jsonrpc: "2.0",
        method,
        params
    };

    try {
        return await axios.post(LOTUS_ENDPOINT, payload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TOKEN}`
            }
        });
    } catch (error) {
        console.error("Ошибка при выполнении запроса:", error);
        throw error;
    }
}

// Test creating a new wallet
async function createWallet(): Promise<void> {
    const response = await makeRPCRequest("Filecoin.WalletNew", ["bls"]);
    console.log(response.data);
}

// Test creating a new auth token
async function createAuthToken(): Promise<void> {
    const response = await makeRPCRequest("Filecoin.AuthNew", [["admin"]]);
    console.log(response.data);
}

createWallet();
createAuthToken();
