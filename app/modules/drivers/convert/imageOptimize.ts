import {Readable} from 'node:stream';
import {DriverInput} from '../interface.js';
import AbstractDriver from '../abstractDriver.js';
import {encodePublicationImage} from '../../content/publicationImagePolicy.js';

export class ImageOptimizeDriver extends AbstractDriver {
    supportedInputs = [DriverInput.Stream];

    async processByStream(stream, options: any = {}) {
        const timer = setTimeout(() => stream.destroy(new Error('image_optimization_input_timeout')), 60000);
        try {
            const result = await encodePublicationImage(stream, options.watermark, options.watermarkApplied);
            return {stream: Readable.from([result.bytes]), type: 'image/webp', extension: 'webp'};
        } finally {
            clearTimeout(timer);
            stream.destroy();
        }
    }
}
