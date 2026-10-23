import {Readable} from 'node:stream';
import {DriverInput} from '../interface.js';
import AbstractDriver from '../abstractDriver.js';
import {imagePolicy, imageFormat, encodePublicationImage} from '../../content/publicationImagePolicy.js';

export class ImageOptimizeDriver extends AbstractDriver {
    supportedInputs = [DriverInput.Stream];

    async processByStream(stream, options: any = {}) {
        const timer = setTimeout(() => stream.destroy(new Error('image_optimization_input_timeout')), 60000);
        try {
            const selectedPolicy = imagePolicy(options.imagePolicy);
            const result = await encodePublicationImage(stream, options.watermark, options.watermarkApplied, selectedPolicy);
            const format = imageFormat(selectedPolicy);
            return {stream: Readable.from([result.bytes]), type: format.mimeType, extension: format.extension};
        } finally {
            clearTimeout(timer);
            stream.destroy();
        }
    }
}
