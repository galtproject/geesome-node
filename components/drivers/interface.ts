/*
 * Copyright ©️ 2018 Galt•Space Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka),
 * [Dima Starodubcev](https://github.com/xhipster),
 * [Valery Litvin](https://github.com/litvintech) by
 * [Basic Agreement](http://cyb.ai/QmSAWEG5u5aSsUyMNYuX2A2Eaz4kEuoYWUkVBRdmu9qmct:ipfs)).
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) and
 * Galt•Space Society Construction and Terraforming Company by
 * [Basic Agreement](http://cyb.ai/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS:ipfs)).
 */

import {Stream} from "stream";

export interface IDriver {
    supportedInputs: string[];
    processByStream?(inputSteam: Stream, options?): Promise<IDriverResponse>;
    processByContent?(inputContent: any, options?): Promise<IDriverResponse>;
    processBySource?(sourceLink: any, options?): Promise<IDriverResponse>;
}

export enum DriverInput {
    Stream = 'stream',
    Content = 'content',
    Source = 'source'
}

export interface IDriverResponse {
    stream?: Stream;
    content?: any;
    path?: string;
    type?: string;
    extension?: string;
}
