/*
 * Copyright ©️ 2020 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

const classRegExp = className => new RegExp(`(^|\\s+)${className.toString().trim()}(\\s+|$)`, 'g');

export const hasClass = (el, className) => classRegExp(className).test(el.className);

export const addClass = (el, className) => {
  const classNames = className.split(' ')
  classNames.length > 1 ? classNames.forEach(className => addClass(el, className))
    : hasClass(el, className) || (el.className = `${el.className} ${className}`.trim())
};

export const removeClass = (el, className) => {
  el.className = el.className.replace(classRegExp(className), ' ').trim()
};

