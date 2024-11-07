/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {DriverInput, OutputSize} from "../interface.js";
import AbstractDriver from "../abstractDriver.js";

export class TextPreviewDriver extends AbstractDriver {
  supportedInputs = [DriverInput.Content];
  supportedOutputSizes = [OutputSize.Medium];

  async processByContent(content, options: any = {}) {
    // TODO: get previewTextLength by settings
    let previewTextLength = 100;
    // disabled for optimization
    // if(options.size === 'small') {
    //   previewTextLength = 20;
    // }
    // if(options.size === 'large') {
    //   previewTextLength = 500;
    // }
    const baseText = content.toString('utf8');
    if(baseText.length <= previewTextLength) {
      return {
        content: baseText,
        type: 'text/plain',
        extension: 'txt',
        notChanged: true
      };
    }
    return {
      content: baseText.replace(/(<([^>]+)>)/ig, "").slice(0, previewTextLength),
      type: 'text/plain',
      extension: 'txt'
    };
  }
}
