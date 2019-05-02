# DCity market

API for working with shops and orders to get payments and withdraw it.

## How to run

1. Install [nvm and node v10.15.3](https://github.com/creationix/nvm)
2. Install mysql database software and configure it for non-default values(local server and root/root access) at `./database/mysql/` folder
3. `npm i`
4. `npm start`

## Environment variables

| Variable | Description |
|-----|-------------|
| DATABASE_NAME | Specify database name for store |
| API_PORT | Specify port of application api  |
| RPC_SERVER | Specify address of rpc server  |

## Use pm2 example for working in background
```
pm2 install typescript
DATABASE_NAME=dcity_token_sale API_PORT=3366 RPC_WS_SERVER=ws://localhost:8646 pm2 start ./index.ts --name "dcity-token-sale"
pm2 save
pm2 startup
```

## API

| URL | Header | Body | Response |
| --- | --- | --- | --- |
| /v1/create-order | None | {accountAddress,tokensAmount} | {id,acquiringName,acquiringOrderId,acquiringPaymentUrl,chainAccountAddress,chainName,tokensAddress,acquiringStatus,tokensAmount,fiatAmount,createdAt,updatedAt} |
| /v1/check-order/{orderId} | None | None | {changed, oldStatus, newStatus, order} |
| /v1/orders | None | None | [{}] |
| /v1/orders/{orderId} | None | None | {} |

##  Tests
```
npm test
```

### Tests coverage
```
npm run testCoverage
```

