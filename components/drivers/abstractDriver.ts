/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {DriverInput, IDriver, IDriverResponse, OutputSize} from "./interface";

const _ = require('lodash');

export default class AbstractDriver implements IDriver {
  supportedInputs = [];
  supportedOutputSizes = [];
  
  isInputSupported(input: DriverInput) {
    return _.includes(this.supportedInputs, input);
  }
  
  isOutputSizeSupported(outputSize: OutputSize) {
    return _.includes(this.supportedOutputSizes, outputSize);
  }

  async isInputExtensionSupported(inputExtension: string) {
    return false;
  }
  
  processByStream?(inputSteam, options?) { return null; };

  processByContent?(inputContent, options?) { return null; };

  processBySource?(sourceLink, options?) { return null; };
}
