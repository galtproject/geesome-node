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

  processByStream?(inputSteam, options?) { return null; };

  processByContent?(inputContent, options?) { return null; };

  processBySource?(sourceLink, options?) { return null; };
}
