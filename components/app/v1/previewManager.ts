import {IGeesomeApp} from "../interface";
const _ = require('lodash');
const sharp = require('sharp');

module.exports = (app: IGeesomeApp) => {
    return {
        async getPreviewStorageId(storageId, type, data) {
            const saveDataOptions = {userId: data.userId, groupId: data.groupId, preview: true};
            
            if(_.startsWith(type, 'image')) {
                const ext = type.split('/')[1] || 'jpg';
                const stream = app.storage.getFileStream(storageId);

                const resizerStream =
                    sharp()
                        .resize({ height: 800, withoutEnlargement: true })
                        // .composite([{
                        //     input: stream,
                        //     blend: 'dest-in'
                        // }])
                        .toFormat(ext);
                console.log('resizerStream', resizerStream);

                const storageFile = await app.saveData(stream.pipe(resizerStream), 'preview.' + ext, saveDataOptions);
                return storageFile.id;
            } else if(_.startsWith(type, 'text')) {
                const previewTextLength = 50;
                
                const previewText = await (new Promise((resolve, reject) => {
                    let resolved = false;
                    const stream = app.storage.getFileStream(storageId);
                    let string = '';
                    
                    console.log('stream', stream);
                    stream.on('data', (file) => {
                        console.log('file', file);
                        file.on('readable',function(buffer){
                            string += buffer.read().toString();
                            if(string.length > previewTextLength) {
                                file.destroy();
                                resolve(getStringPreview());
                                resolved = true;
                            }
                        });

                        file.on('end',function(){
                            if(!resolved) {
                                resolve(getStringPreview());
                                resolved = true;
                            }
                        });
                    });
                    
                    function getStringPreview() {
                        return string.replace(/(<([^>]+)>)/ig,"").slice(0, previewTextLength);
                    }
                }));

                const storageFile = await app.saveData(previewText, 'preview', saveDataOptions);
                return storageFile.id;
            }
            return null;
            //https://stackoverflow.com/questions/13079742/how-to-generate-video-thumbnail-in-node-js
        }
    }
}
