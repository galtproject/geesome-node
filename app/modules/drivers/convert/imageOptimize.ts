import {Readable} from 'node:stream';
import {DriverInput} from '../interface.js';
import AbstractDriver from '../abstractDriver.js';
import {encodePublicationImage} from '../../imageOptimization/policy.js';

export class ImageOptimizeDriver extends AbstractDriver {
    supportedInputs = [DriverInput.Stream];

    async processByStream(stream) {
        const timer = setTimeout(() => stream.destroy(new Error('image_optimization_input_timeout')), 60000);
        try {
            const result = await encodePublicationImage(stream);
            return {stream: Readable.from([result.bytes]), type: 'image/webp', extension: 'webp'};
        } finally {
            clearTimeout(timer);
            stream.destroy();
        }
    }
}
