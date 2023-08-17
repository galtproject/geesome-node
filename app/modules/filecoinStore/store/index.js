import { create } from 'ipfs-http-client';
import fs from 'fs';
import path from "path";
import { Writable } from 'stream'
import { createDirectoryEncoderStream, CAREncoderStream } from 'ipfs-car'
import { filesFromPaths } from 'files-from-path'
// import { HttpJsonRpcConnector, LotusWalletProvider, LotusClient} from "filecoin.js";


// const localNodeUrl = "http://127.0.0.1:1234/rpc/v0";
// const signAuthToken ="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJBbGxvdyI6WyJyZWFkIiwid3JpdGUiLCJzaWduIiwiYWRtaW4iXX0.ro6hN4mxR_Xsv47vmkM59_5H84VmYwYY3GM9gjLW4zk"
// const httpConnector = new HttpJsonRpcConnector({ url: localNodeUrl, token: signAuthToken });
// const lotusClient = new LotusClient(httpConnector);
// const lotusWallet = new LotusWalletProvider(lotusClient);

const client = create({ url: "http://go_ipfs:5001"});

export default {
  async createDeal (ipfsHash) {
    console.log("Start save file");
    await getLinks(ipfsHash);
    await getCAr([ipfsHash]);
    return "IPFS TO CAR DONE!!"
  }
};

async function getLinks(ipfsPath, localPath = ipfsHash) {
  console.log("Start make dir");
  if (!fs.existsSync(ipfsHash)) {
    fs.mkdirSync(ipfsHash, { recursive: true });
  }  
  for await (const link of client.ls(ipfsPath)) {
    const newPath = path.join(localPath, link.name);
    const links = [];
    if (link.type === "file") {
      retrieve(link.path, newPath);
      links.push(link.path)
    } else {
      if (!fs.existsSync(newPath)) {
        fs.mkdirSync(newPath, { recursive: true });
      }
      getLinks(link.cid, newPath);
    }
  }
};


async function getCAr(files) {
  const filesSlpit = await filesFromPaths(files)
  await createDirectoryEncoderStream(filesSlpit)
  .pipeThrough(new CAREncoderStream())
  .pipeTo(Writable.toWeb(fs.createWriteStream(`${files[0]}.car`)))
  console.log("Transfer to car file was successful!");
};

async function retrieve(cid, filePath) {
  const writeStream = fs.createWriteStream(filePath);

  for await (const buf of client.get(cid)) {
    writeStream.write(buf);
  }

  writeStream.end();
};

  // async function storeFile(){
  //   try {
  //     // 1. import data to lotus
  //     const importResult = await lotusClient.client.import({
  //       Path: "5gb-filecoin-huyni.bin",
  //       IsCAR: false,
  //   });
  //   console.log(importResult);
  //   const queryOffer = await lotusClient.client.minerQueryOffer('f01832584', importResult);
  //   console.log(queryOffer);
  //   const isActive = importResult.Root["/"] === queryOffer.Root["/"];
  //   console.log("Provider is active: ", isActive);
  //     //3. start storage deal with SP
  //     if(isActive){
  //       const dealCid = await lotusClient.client.startDeal({
  //         Data: {
  //           TransferType: 'graphsync',
  //           Root: importResult.Root,
  //         },
  //         Miner: 'f01832584',
  //         Wallet: await lotusWallet.getDefaultAddress(),
  //         EpochPrice: queryOffer["MinPrice"],
  //         MinBlocksDuration: 434000,
  //       });

        
  //       console.log("dealCID is ", dealCid);
  //     }
  //   } catch (error) {
  //     console.log(error);
  //   }
  // }