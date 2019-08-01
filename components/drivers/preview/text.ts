import {DriverInput, OutputSize} from "../interface";
import AbstractDriver from "../abstractDriver";

export class TextPreviewDriver extends AbstractDriver {
  supportedInputs = [DriverInput.Content];
  supportedOutputSizes = [OutputSize.Small, OutputSize.Medium, OutputSize.Large];

  async processByContent(content, options: any = {}) {
    // TODO: get previewTextLength by settings
    let previewTextLength = 100;
    if(options.size === 'small') {
      previewTextLength = 20;
    }
    if(options.size === 'large') {
      previewTextLength = 500;
    }
    return {
      content: content.toString('utf8').replace(/(<([^>]+)>)/ig, "").slice(0, previewTextLength),
      type: 'text/plain',
      extension: 'txt'
    };
  }
}
