const axios = require('axios');

const LOTUS_ENDPOINT = 'http://lotus:1234/rpc/v0';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJBbGxvdyI6WyJyZWFkIiwid3JpdGUiLCJzaWduIiwiYWRtaW4iXX0.UIFVzS-t31nrororoororoot@rororoororrrrrorrrrrrrrrorrrroot@geesroot@geesomeroot@geeroororoorrrrrrroorroroot@geesome-test-2:~/geesome-node/.docker-data/lotus#';

async function makeRPCRequest(method, params) {
    try {
        const response = await axios.post(LOTUS_ENDPOINT, {
            id: 1,
            jsonrpc: "2.0",
            method: method,
            params: params
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TOKEN}`
            }
        });

        return response.data;
    } catch (error) {
        console.error("Ошибка при выполнении запроса:", error);
    }
}

// Test creating a new wallet
async function createWallet() {
    const response = await makeRPCRequest("Filecoin.WalletNew", ["bls"]);
    console.log(response);
}

// Test creating a new auth token
async function createAuthToken() {
    const response = await makeRPCRequest("Filecoin.AuthNew", [["admin"]]);
    console.log(response);
}

createWallet();
createAuthToken();
