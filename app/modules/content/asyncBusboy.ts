import fs from 'fs';
import os from 'os';
import path from 'path';
import busboy from 'busboy';
import {createHash} from 'node:crypto';

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
function onFile (filePromises, signal, file, stream, info) {
  const { filename, encoding, mimeType } = info
  const tmpName = Math.random().toString(16).substring(2) + '-' + filename
  const saveTo = path.join(os.tmpdir(), path.basename(tmpName))
  const writeStream = fs.createWriteStream(saveTo)
  const hash = createHash('sha256')
  let bytes = 0
  let complete = false
  const abort = () => {
    stream.destroy(signal.reason)
    writeStream.destroy(signal.reason)
  }
  const filePromise = new Promise((resolve, reject) => {
    stream.on('limit', () => {
      const err: any = new Error('Reach file size limit')
      err.code = 'Request_file_size_limit'
      err.status = 413
      writeStream.destroy(err)
      stream.resume()
    })
    stream.on('error', reject)
    signal.addEventListener('abort', abort, {once: true})
    writeStream.once('close', () => {
      signal.removeEventListener('abort', abort)
      if (!complete || signal.aborted) {
        fs.rm(saveTo, {force: true}, () => {})
      }
    })
    if (signal.aborted) {
      abort()
    }
    writeStream
      .on('open', () => {
        if (signal.aborted) {
          return
        }
        // A data listener starts flowing mode. Attach it only when the writer
        // is ready, immediately before piping, so early bytes cannot be lost.
        stream.on('data', (chunk) => {
          hash.update(chunk)
          bytes += chunk.length
        })
        stream.pipe(writeStream)
          .on('error', reject)
          .on('finish', () => {
            complete = true
            const readStream: any = fs.createReadStream(saveTo)

            readStream.fieldname = file
            readStream.filename = filename
            readStream.transferEncoding = readStream.encoding = encoding
            readStream.mimeType = readStream.mime = mimeType
            readStream.tempPath = saveTo
            readStream.sha256 = hash.digest('hex')
            readStream.bytes = bytes
            readStream.emitFinish = (callback) => {
              fs.rm(saveTo, { force: true }, function () {
                callback && callback()
              })
            }
            resolve(readStream)
          })
      })
      .on('error', (err) => {
        fs.rm(saveTo, { force: true }, () => {})
        stream.resume()
          .on('error', reject)
        reject(err)
      })
  })
  // Abort may reject a file before the multipart parser reaches its end.
  filePromise.catch(() => {})
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
    const controller = new AbortController()
    const fieldHandler = onField.bind(null, fields)
    const fileHandler = customOnFile || onFile.bind(null, filePromises, controller.signal)
    let settled = false
    let ending = false

    request.on('aborted', onAborted)
    request.on('error', onError)
    request.on('close', onClose)

    bb.on('field', fieldHandler)
        .on('file', fileHandler)
        .on('error', onError)
        .on('end', onEnd)
        .on('close', onEnd)
        .on('partsLimit', () => onLimit('parts'))
        .on('filesLimit', () => onLimit('files'))
        .on('fieldsLimit', () => onLimit('fields'))

    if (request.aborted || (request.destroyed && !request.readableEnded && request.complete !== true)) {
      onAborted()
    } else {
      request.pipe(bb)
    }

    function onLimit (kind) {
      const err: any = new Error(`Reach ${kind} limit`)
      err.code = `Request_${kind}_limit`
      err.status = 413
      onError(err)
    }

    function onAborted () {
      const err: any = new Error('Upload request aborted')
      err.code = 'upload_aborted'
      err.status = 400
      onError(err)
    }

    function onClose () {
      if (request.aborted || request.complete === false || (!request.complete && !request.readableEnded)) {
        onAborted()
      }
    }

    function onError (err) {
      if (settled) {
        return
      }
      settled = true
      controller.abort(err)
      request.unpipe(bb)
      // Destroying the parser stops file streams; its error listener remains
      // installed until close so late stream errors cannot become unhandled.
      bb.once('close', () => bb.removeListener('error', onError))
      bb.destroy()
      cleanup()
      // IncomingMessage may emit its socket error after the aborted event.
      request.on('error', onError)
      for (const pending of filePromises) {
        pending.then(file => {
          file.on('error', () => {})
          file.destroy()
          file.emitFinish()
        }, () => {})
      }
      reject(err)
    }

    function onEnd () {
      if (settled || ending) {
        return
      }
      ending = true
      Promise.all(filePromises).then(files => {
        if (settled) {
          return
        }
        settled = true
        cleanup()
        bb.removeListener('error', onError)
        resolve(customOnFile ? {fields} : {fields, files})
      }).catch(onError)
    }

    function cleanup () {
      request.removeListener('aborted', onAborted)
      request.removeListener('error', onError)
      request.removeListener('close', onClose)
      bb.removeListener('field', fieldHandler)
      bb.removeListener('file', fileHandler)
      bb.removeListener('end', onEnd)
      bb.removeListener('close', onEnd)
    }
  })
}
