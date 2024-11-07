import fs from 'fs';
import os from 'os';
import path from 'path';
import busboy from 'busboy';

const getDescriptor = Object.getOwnPropertyDescriptor

/**
 *
 * @param {Object} fields
 * @param {string} name
 * @param {string} value
 * @param {{ nameTruncated: boolean, valueTruncated: boolean, encoding: string, mimeType: string }} info
 */
function onField (fields, name, value, info) {
  // don't overwrite prototypes
  if (getDescriptor(Object.prototype, name)) {
    return
  }

  // This looks like a stringified array, let's parse it
  if (name.indexOf('[') > -1) {
    const obj = objectFromBluePrint(extractFormData(name), value)

    reconcile(obj, fields)
  } else if (getDescriptor(fields, name)) {
    if (Array.isArray(fields[name])) {
      fields[name].push(value)
    } else {
      fields[name] = [fields[name], value]
    }
  } else {
    fields[name] = value
  }
}

/**
 *
 * @param {Array} filePromises
 * @param {string} file
 * @param {Readable} stream
 * @param {{ filename: string, encoding: string, mimeType: string }} info
 */
function onFile (filePromises, file, stream, info) {
  const { filename, encoding, mimeType } = info
  const tmpName = Math.random().toString(16).substring(2) + '-' + filename
  const saveTo = path.join(os.tmpdir(), path.basename(tmpName))
  const writeStream = fs.createWriteStream(saveTo)
  const filePromise = new Promise((resolve, reject) =>
    writeStream
      .on('open', () =>
        stream.pipe(writeStream)
          .on('error', reject)
          .on('finish', () => {
            const readStream: any = fs.createReadStream(saveTo)

            readStream.fieldname = file
            readStream.filename = filename
            readStream.transferEncoding = readStream.encoding = encoding
            readStream.mimeType = readStream.mime = mimeType
            resolve(readStream)
          }))
      .on('error', (err) => {
        stream.resume()
          .on('error', reject)
        reject(err)
      }))
  filePromises.push(filePromise)
}

/**
 *
 * Extract a hierarchy array from a stringified formData single input.
 *
 *
 * i.e. topLevel[sub1][sub2] => [topLevel, sub1, sub2]
 *
 * @param  {String} string: Stringify representation of a formData Object
 * @return {Array}
 *
 */
const extractFormData = (string) => {
  const arr = string.split('[')
  const first = arr.shift()
  const res = arr.map((v) => v.split(']')[0])

  res.unshift(first)
  return res
}

/**
 *
 * Generate an object given a hierarchy blueprint and the value
 *
 * i.e. [key1, key2, key3] => { key1: {key2: { key3: value }}}
 *
 * @param  {Array} arr:   from extractFormData
 * @param  {[type]} value: The actual value for this key
 * @return {[type]}       [description]
 *
 */
const objectFromBluePrint = (arr, value) => {
  return arr.reverse().reduce((acc, next) => {
    if (Number(next).toString() === 'NaN') {
      return { [next]: acc }
    }

    const newAcc = []
    newAcc[Number(next)] = acc
    return newAcc
  }, value)
}

/**
 * Reconciles formatted data with already formatted data
 *
 * @param  {Object} obj extractedObject
 * @param  {Object} target the field object
 * @return {Object} reconciled fields
 *
 */
const reconcile = (obj, target) => {
  const key = Object.keys(obj)[0]
  const val = obj[key]

  // reconcile works even if obj is an array since Object.keys yields
  // only the existing (i.e., possibly sparse) indexes - see
  // https://jsbin.com/hulekomopo/1/
  // Since array are in form of [ , , value3] [value1, value2] the
  // final array will be: [value1, value2, value3] as expected
  if (getDescriptor(target, key)) {
    return reconcile(val, target[key])
  }

  return (target[key] = val)
}

export default function (request, options): Promise<any> {
  options = options || {}
  options.headers = options.headers || request.headers
  const customOnFile = typeof options.onFile === 'function' ? options.onFile : false
  delete options.onFile
  const bb = busboy(options)

  return new Promise((resolve, reject) => {
    const fields = {}
    const filePromises = []

    request.on('close', cleanup)

    bb.on('field', onField.bind(null, fields))
        .on('file', customOnFile || onFile.bind(null, filePromises))
        .on('error', onError)
        .on('end', onEnd)
        .on('close', onEnd)
        .on('partsLimit', function () {
          const err: any = new Error('Reach parts limit')
          err.code = 'Request_parts_limit'
          err.status = 413
          onError(err)
        })
        .on('filesLimit', () => {
          const err: any = new Error('Reach files limit')
          err.code = 'Request_files_limit'
          err.status = 413
          onError(err)
        })
        .on('fieldsLimit', () => {
          const err: any = new Error('Reach fields limit')
          err.code = 'Request_fields_limit'
          err.status = 413
          onError(err)
        })

    request.pipe(bb)

    function onError (err) {
      cleanup()
      return reject(err)
    }

    function onEnd (err) {
      if (err) {
        return reject(err)
      }

      if (customOnFile) {
        cleanup()
        resolve({ fields })
      } else {
        Promise.all(filePromises)
            .then((files) => {
              cleanup()
              resolve({ fields, files })
            })
            .catch(reject)
      }
    }

    function cleanup () {
      bb.removeListener('field', onField)
      bb.removeListener('file', customOnFile || onFile)
      bb.removeListener('error', onEnd)
      bb.removeListener('end', cleanup)
      bb.removeListener('close', cleanup)
      bb.removeListener('partsLimit', onEnd)
      bb.removeListener('filesLimit', onEnd)
      bb.removeListener('fieldsLimit', onEnd)
    }
  })
}
