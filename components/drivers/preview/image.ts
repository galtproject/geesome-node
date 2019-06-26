import {DriverInput, IDriver} from "../interface";

import {Stream} from "stream";

const sharp = require('sharp');

export class ImagePreviewDriver implements IDriver{
    supportedInputs = [DriverInput.Stream];

    async processByStream(inputStream, options: any = {}) {
        const extension = options.extension || 'jpg';
        const resizerStream =
            sharp()
                // TODO: get height by settings
                .resize({ height: 800, withoutEnlargement: true })
                .toFormat(extension);

        return {
            stream: inputStream.pipe(resizerStream) as Stream,
            type: 'image/' + extension,
            extension: extension
        };
    }
}
