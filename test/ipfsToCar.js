import { create } from 'ipfs-http-client';
import { CarWriter } from '@ipld/car';
import { CID } from 'multiformats/cid';
import { MemoryBlockstore } from 'blockstore-core/memory';
import fs from 'fs';
import { Readable } from 'stream';
import asyncIteratorToStream from "async-iterator-to-stream";

async function convertHashToCar(ipfsHash) {
  // Create an instance of IPFS client
  const ipfs = create();

  // Convert ipfsHash to CID instance
  let cid;
  try {
    cid = CID.parse(ipfsHash);
    console.log(`CID successfully created: ${cid.toString()}`);
    console.log(`CID Object: `, cid);
  } catch (err) {
    console.error('Error while creating CID:', err);
    return;
  }

  console.log('cid[\'/\']', cid['/']);
  // Create a Writer for CAR
  let writer, out;
  try {
    ({ writer, out } = await CarWriter.create(cid));
  } catch (err) {
    console.error('Error while creating CAR writer:', err);
    return;
  }

  // Get the stream of bytes by IPFS hash
  const bytesIterable = await ipfs.cat(ipfsHash);
  console.log('bytesIterable', bytesIterable);
  console.log('writer', writer);

  writer._mutex.then(r => {
    console.log('writer._mutex', r);
  }).catch(e => {
    console.error('writer._mutex e', e);
  });
  Readable.from(out).pipe(fs.createWriteStream('example.car'));

  await new Promise((resolve) => {
    asyncIteratorToStream(bytesIterable)
        .on('data', (chunk) => {
          console.log('data', chunk);
          writer.put({cid: cid, bytes: chunk});
        })
        .on('close', (chunk) => {
          console.log('close');
          resolve();
        });
  });

  console.log('after await');
  //
  // bytesIterable.pipe(writer);
  // // Read the stream of bytes and add blocks to CAR
  // // try {
  // //   for await (const chunk of bytesIterable) {
  // //     console.log('chunk', chunk);
  // //     await writer.put({ cid, bytes: chunk });
  // //   }
  // // } catch (err) {
  // //   console.error('Error while adding chunks to CAR:', err);
  // //   return;
  // // }
  //
  // // Finish writing
  // await writer.close();
  //
  // // Get CAR as Uint8Array
  // const carBytes = await out.toBytes();
  //
  // // Use carBytes as you like, for example, save as a file or send to a server
  // console.log('CAR file successfully created:', carBytes);
}

// Example of use
convertHashToCar('bafkreiftgqgcr6ivx5spmkbklxilkfie4bvs7ckapanvbb5cmj2ty44dei').catch(console.error); // site
// convertHashToCar('bafybeibrkegmkwxp46rtz63gu25exeexhbzu42gye6wqm3w3i2ok4qalpi').catch(console.error); // pepa

process.once('uncaughtException', (err, origin) => {
  console.error(err);
})