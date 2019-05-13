import {IGeesomeApp} from "../interface";
const _ = require('lodash');
const sharp = require('sharp');

module.exports = (app: IGeesomeApp) => {
    return {
        async getPreviewStorageId(storageId, type, data) {
            if(_.startsWith(type, 'image')) {
                const ext = type.split('/')[1] || 'jpg';
                const stream = app.storage.getFileStream(storageId);

                const resizerStream =
                    sharp()
                        .resize({ height: 800, withoutEnlargement: true })
                        .composite([{
                            input: stream,
                            blend: 'dest-in'
                        }])
                        .toFormat(ext);

                const storageFile = await app.saveData(resizerStream, 'preview', data.userId, data.groupId)
                return storageFile.id;
            } else if(_.startsWith(type, 'text')) {
                const previewTextLength = 50;
                
                const previewText = await (new Promise((resolve, reject) => {
                    let resolved = false;
                    const stream = app.storage.getFileStream(storageId);
                    
                    let string = '';
                    stream.on('readable',function(buffer){
                        string += buffer.read().toString();
                        if(string.length > previewTextLength) {
                            stream.destroy();
                            resolve(getStringPreview());
                            resolved = true;
                        }
                    });

                    stream.on('end',function(){
                        if(!resolved) {
                            resolve(getStringPreview());
                            resolved = true;
                        }
                    });
                    
                    function getStringPreview() {
                        return string.replace(/(<([^>]+)>)/ig,"").slice(0, previewTextLength);
                    }
                }));

                const storageFile = await app.saveData(previewText, 'preview', data.userId, data.groupId);
                return storageFile.id;
            }
            return null;
            //https://stackoverflow.com/questions/13079742/how-to-generate-video-thumbnail-in-node-js
        }
    }
}
