import {IGeesomeApp} from "../interface";
const _ = require('lodash');
const sharp = require('sharp');

module.exports = (app: IGeesomeApp) => {
    return {
        async getPreviewStorageId(storageId, type, data?) {
            if(_.startsWith(type, 'image')) {
                const ext = type.split('/')[1] || 'jpg';
                const stream = await app.storage.getFileStream(storageId);
                
                const resizerStream =
                    sharp()
                        .resize({ height: 800, withoutEnlargement: true })
                        .toFormat(ext);
                
                const storageFile = await app.storage.saveFileByData(stream.pipe(resizerStream));
                return storageFile.id;
            } else if(_.startsWith(type, 'text')) {
                const previewTextLength = 50;
                
                const data = await app.storage.getFileData(storageId);
                let previewString = data.toString('utf8').replace(/(<([^>]+)>)/ig,"").slice(0, previewTextLength);

                const storageFile = await app.storage.saveFileByData(previewString);
                return storageFile.id;
            }
            
            return null;
            //https://stackoverflow.com/questions/13079742/how-to-generate-video-thumbnail-in-node-js
        }
    }
}
