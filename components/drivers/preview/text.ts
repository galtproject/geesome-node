import {DriverInput, IDriver} from "../interface";

export class TextPreviewDriver implements IDriver{
    supportedInputs = [DriverInput.Content];

    async processByContent(content, options: any = {}) {
        const previewTextLength = 50;
        return {
            content: content.toString('utf8').replace(/(<([^>]+)>)/ig,"").slice(0, previewTextLength),
            type: 'text'
        };
    }
}
