import fs from "fs";
import _ from 'lodash';
import mime from 'mime';
import debug from 'debug';
import axios from "axios";
import pIteration from 'p-iteration';
import uuidAPIKey from "uuid-apikey";
import { BufferListStream } from 'bl';
import {Transform, Readable} from 'stream';
import commonHelper from "geesome-libs/src/common.js";
import ipfsHelper from "geesome-libs/src/ipfsHelper.js";
import detecterHelper from "geesome-libs/src/detecter.js";
import {IGeesomeApp} from "../../interface.js";
import {
	ContentMimeType,
	ContentStorageType,
	ContentView,
	CorePermissionName,
	IContent,
	IListParams,
	UserContentActionName,
	UserLimitName
} from "../database/interface.js";
import driverHelpers from '../drivers/helpers.js';
import IGeesomeContentModule from "./interface.js";
import AbstractDriver from "../drivers/abstractDriver.js";
import {DriverInput, OutputSize} from "../drivers/interface.js";
import helpers from "../../helpers";
const {pick, isArray, isNumber, isTypedArray, isString, isBuffer, merge, last, startsWith, trimStart} = _;
const log = debug('geesome:app');
const {getDirSize} = driverHelpers;

export default async (app: IGeesomeApp) => {
	const module = getModule(app);
	(await import('./api.js')).default(app, module);
	return module;
}

function getModule(app: IGeesomeApp) {
	app.checkModules(['database', 'drivers', 'storage']);

	class ContentModule implements IGeesomeContentModule {

		async getAllContentList(adminId, searchString?, listParams?: IListParams) {
			listParams = helpers.prepareListParams(listParams);
			await app.checkUserCan(adminId, CorePermissionName.AdminRead);
			return {
				list: await app.ms.database.getAllContentList(searchString, listParams),
				total: await app.ms.database.getAllContentCount(searchString)
			}
		}

		getFileStream(filePath, options = {}) {
			return app.ms.storage.getFileStream(filePath, options)
		}

		getContent(contentId) {
			return app.ms.database.getContent(contentId);
		}

		getContentByStorageId(storageId) {
			return app.ms.database.getContentByStorageId(storageId);
		}

		getContentByStorageAndUserId(storageId, userId) {
			return app.ms.database.getContentByStorageAndUserId(storageId, userId);
		}

		getContentByManifestId(storageId) {
			return app.ms.database.getContentByManifestId(storageId);
		}

		async updateContentManifest(content) {
			content.description = content.description || '';
			const manifestStorageId = await app.generateAndSaveManifest('content', content);
			content.manifestStorageId = manifestStorageId;
			await app.ms.database.updateContent(content.id, {manifestStorageId});
			return content;
		}

		async regenerateUserContentPreviews(userId: number) {
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			const previousIpldToNewIpld = [];
			let userContents = [];

			let offset = 0;
			let limit = 100;
			do {
				userContents = await app.ms.database.getContentList(userId, {
					offset,
					limit
				});

				await pIteration.forEach(userContents, async (content: IContent) => {
					const previousIpldToNewIpldItem = [content.manifestStorageId];
					let previewData = await this.getPreview({id: content.storageId, size: content.size}, content.extension, content.mimeType);
					await app.ms.database.updateContent(content.id, previewData);
					const updatedContent = await this.updateContentManifest({
						...content.toJSON() as any,
						...previewData
					});

					previousIpldToNewIpldItem.push(updatedContent.manifestStorageId);

					previousIpldToNewIpld.push(previousIpldToNewIpldItem);
				});

				offset += limit;
			} while (userContents.length === limit);

			console.log('previousIpldToNewIpld', previousIpldToNewIpld);
			console.log('previousIpldToNewIpld JSON', JSON.stringify(previousIpldToNewIpld));
		}

		async getPreview(storageFile: IStorageFile, extension, fullType, source?) {
			let storageId = storageFile.id;

			let previewDriverName;
			if (source) {
				if (detecterHelper.isYoutubeUrl(source)) {
					previewDriverName = 'youtubeThumbnail';
				}
			}
			if (!fullType) {
				fullType = '';
			}
			if (!previewDriverName) {
				const splitType = fullType.split('/');
				previewDriverName = app.ms.drivers.preview[splitType[1]] ? splitType[1] : splitType[0];
			}
			if (previewDriverName === 'gif') {
				extension = 'png';
			}
			log('previewDriverName', previewDriverName);
			let previewDriver = app.ms.drivers.preview[previewDriverName] as AbstractDriver;
			if (!previewDriver) {
				return {};
			}

			try {
				if (previewDriver.isInputSupported(DriverInput.Stream)) {
					const {storageFile: mediumFile, type, extension: resultExtension} = await this.getContentPreviewStorageFile(storageFile, previewDriver, {
						extension,
						size: OutputSize.Medium
					});

					let smallFile;
					if (previewDriver.isOutputSizeSupported(OutputSize.Small)) {
						smallFile = await this.getContentPreviewStorageFile(storageFile, previewDriver, {
							extension,
							size: OutputSize.Small
						});
						smallFile = smallFile.storageFile;
					}

					let largeFile;
					if (previewDriver.isOutputSizeSupported(OutputSize.Large)) {
						largeFile = await this.getContentPreviewStorageFile(storageFile, previewDriver, {
							extension,
							size: OutputSize.Large
						});
						largeFile = largeFile.storageFile;
					}

					return {
						smallPreviewStorageId: smallFile ? smallFile.id : null,
						smallPreviewSize: smallFile ? smallFile.size : null,
						largePreviewStorageId: largeFile ? largeFile.id : null,
						largePreviewSize: smallFile ? smallFile.size : null,
						mediumPreviewStorageId: mediumFile.id,
						mediumPreviewSize: mediumFile.size,
						previewMimeType: type,
						previewExtension: resultExtension
					};
				} else if (previewDriver.isInputSupported(DriverInput.Content)) {
					log('preview DriverInput.Content');
					const data = await app.ms.storage.getFileData(storageId);
					log('getFileData');

					const {content: mediumData, type, extension: resultExtension, notChanged: mediumNotChanged} = await previewDriver.processByContent(data, {
						extension,
						size: OutputSize.Medium
					});
					log('processByContent');
					const mediumFile = mediumNotChanged ? storageFile : await app.ms.storage.saveFileByData(mediumData);
					log('mediumFile saveFileByData');

					let smallFile;
					if (previewDriver.isOutputSizeSupported(OutputSize.Small)) {
						const {content: smallData, notChanged: smallNotChanged} = await previewDriver.processByContent(data, {extension, size: OutputSize.Small});
						smallFile = smallNotChanged ? storageFile : await app.ms.storage.saveFileByData(smallData);
					}
					log('smallFile saveFileByData');

					let largeFile;
					if (previewDriver.isOutputSizeSupported(OutputSize.Large)) {
						const {content: largeData, notChanged: largeNotChanged} = await previewDriver.processByContent(data, {extension, size: OutputSize.Large});
						largeFile = largeNotChanged ? storageFile : await app.ms.storage.saveFileByData(largeData);
					}
					log('largeFile saveFileByData');

					return {
						smallPreviewStorageId: smallFile ? smallFile.id : null,
						smallPreviewSize: smallFile ? smallFile.size : null,
						largePreviewStorageId: largeFile ? largeFile.id : null,
						largePreviewSize: smallFile ? smallFile.size : null,
						mediumPreviewStorageId: mediumFile.id,
						mediumPreviewSize: mediumFile.size,
						previewMimeType: type,
						previewExtension: resultExtension
					};
				} else if (previewDriver.isInputSupported(DriverInput.Source)) {
					const {content: resultData, path, extension: resultExtension, type} = await previewDriver.processBySource(source, {});
					let storageFile;
					if (path) {
						storageFile = await app.ms.storage.saveFileByPath(path);
					} else {
						storageFile = await app.ms.storage.saveFileByData(resultData);
					}

					//TODO: other sizes?
					return {
						smallPreviewStorageId: null,
						smallPreviewSize: null,
						largePreviewStorageId: null,
						largePreviewSize: null,
						mediumPreviewStorageId: storageFile.id,
						mediumPreviewSize: storageFile.size,
						previewMimeType: type,
						previewExtension: resultExtension
					};
				}
			} catch (e) {
				console.error('getContentPreviewStorageFile error', e);
				return {};
			}
			throw new Error(previewDriver + "_preview_driver_input_not_found");
		}

		async getContentPreviewStorageFile(storageFile: IStorageFile, previewDriver, options): Promise<any> {
			if (app.ms.storage.isStreamAddSupport()) {
				const inputStream = await this.getFileStream(storageFile.id);
				options.onError = (err) => {
					throw err;
				};
				console.log('getContentPreviewStorageFile stream', options);
				const {stream: resultStream, type, extension} = await previewDriver.processByStream(inputStream, options);

				const previewFile = await app.ms.storage.saveFileByData(resultStream);
				console.log('getContentPreviewStorageFile stream storageFile', previewFile);

				let properties;
				if (options.getProperties && app.ms.drivers.metadata[type.split('/')[0]]) {
					const propertiesStream = await this.getFileStream(previewFile.id);
					console.log('getContentPreviewStorageFile stream propertiesStream');
					properties = await app.ms.drivers.metadata[type.split('/')[0]].processByStream(propertiesStream);
				}
				console.log('getContentPreviewStorageFile stream properties', properties);

				return {storageFile: previewFile, type, extension, properties};
			} else {
				if (!storageFile.tempPath) {
					storageFile.tempPath = `/tmp/` + (await commonHelper.random()) + '-' + new Date().getTime() + (options.extension ? '.' + options.extension : '');
					const data: any = new BufferListStream(await app.ms.storage.getFileData(storageFile.id));
					//TODO: find more efficient way to store content from IPFS to fs
					await new Promise((resolve, reject) => {
						data.pipe(fs.createWriteStream(storageFile.tempPath)).on('close', () => resolve(true)).on('error', reject);
					})
					storageFile.emitFinish = () => {
						fs.unlinkSync(storageFile.tempPath);
					};
				}
				console.log('fs.existsSync(storageFile.tempPath)', fs.existsSync(storageFile.tempPath));
				console.log('getContentPreviewStorageFile: path', options);
				const {path: previewPath, type, extension} = await previewDriver.processByPathWrapByPath(storageFile.tempPath, options);

				console.log('previewPath', previewPath);
				const previewFile = await app.ms.storage.saveFileByPath(previewPath);
				const storageContentStat = await app.ms.storage.getFileStat(previewFile.id);
				previewFile.size = storageContentStat.size;
				log('previewFile.size', previewFile.size);
				console.log('getContentPreviewStorageFile path storageFile', previewFile);

				let properties;
				if (options.getProperties && app.ms.drivers.metadata[type.split('/')[0]]) {
					console.log('getContentPreviewStorageFile path propertiesStream');
					properties = await app.ms.drivers.metadata[type.split('/')[0]].processByStream(fs.createReadStream(previewPath));
				}
				console.log('getContentPreviewStorageFile path properties', properties);

				fs.unlinkSync(previewPath);

				return {storageFile: previewFile, type, extension, properties};
			}
		}

		async prepareStorageFileAndGetPreview(storageFile: IStorageFile, extension, fullType) {
			console.log('prepareStorageFileAndGetPreview');
			if (commonHelper.isVideoType(fullType)) {
				const videoThumbnailDriver = app.ms.drivers.preview['videoThumbnail'];
				const {storageFile: imageFile, extension: imageExtension, type: imageType, properties} = await this.getContentPreviewStorageFile(storageFile, videoThumbnailDriver, {
					extension,
					getProperties: true
				});

				return {
					storageFile: imageFile,
					extension: imageExtension,
					fullType: imageType,
					properties: pick(properties, ['width', 'height'])
				}
			} else {
				return {storageFile, extension, fullType};
			}
		}

		async updateExistsContentMetadata(userId: number, content: IContent, options) {
			const propsToUpdate = ['view'];
			if (content.mediumPreviewStorageId && content.previewMimeType) {
				if (propsToUpdate.some(prop => options[prop] && content[prop] !== options[prop])) {
					await app.ms.database.updateContent(content.id, pick(options, propsToUpdate));
					await this.updateContentManifest({
						...content.toJSON() as any,
						...pick(options, propsToUpdate),
					});
				}
				return;
			}
			let updateData = await this.getPreview({id: content.storageId, size: content.size}, content.extension, content.mimeType);
			if (content.userId === userId) {
				updateData = {
					...pick(options, propsToUpdate),
					...updateData,
				}
			}
			await app.ms.database.updateContent(content.id, updateData);
			return this.updateContentManifest({
				...content.toJSON() as any,
				...updateData,
			});
		}

		private async addContent(userId: number, contentData: IContent, options: { userApiKeyId? } = {}): Promise<IContent> {
			log('addContent');
			if (!contentData.userId) {
				contentData.userId = userId;
			}
			await app.callHook('content', 'beforeContentAdding', [userId, contentData, options]);

			if (!contentData.size) {
				const storageContentStat = await app.ms.storage.getFileStat(contentData.storageId);
				log('storageContentStat');

				contentData.size = storageContentStat.size;
			}

			contentData.userId = userId;
			const content = await app.ms.database.addContent(contentData);
			log('content');

			await Promise.all([
				app.callHook('content', 'afterContentAdding', [userId, content, options]),
				app.ms.database.addUserContentAction({
					name: UserContentActionName.Upload,
					userId: content.userId,
					size: content.size,
					contentId: content.id,
					userApiKeyId: options.userApiKeyId
				})
			]);
			log('addUserContentAction');
			if (!contentData.manifestStorageId) {
				log('updateContentManifest');
				return this.updateContentManifest(content);
			} else {
				return content;
			}
		}

		async isAutoActionAllowed(userId, funcName, funcArgs) {
			return ['saveDataAndGetStorageId'].includes(funcName);
		}

		async saveDataAndGetStorageId(userId: number, dataToSave, fileName?, options = {}) {
			return this.saveData(userId, dataToSave, fileName, options).then(c => c.storageId);
		}

		async saveData(userId: number, dataToSave, fileName, options: { view?, driver?, previews?: {content, mimeType, previewSize}, apiKey?, userApiKeyId?, folderId?, mimeType?, path?, onProgress?, waitForPin?, properties? } = {}) {
			log('saveData');

			await app.checkUserCan(userId, CorePermissionName.UserSaveData);

			log('checkUserCan');
			if (options.path) {
				fileName = commonHelper.getFilenameFromPath(options.path);
			}
			//TODO: use for streams https://github.com/mscdex/busboy/issues/212
			const extensionFromName = commonHelper.getExtensionFromName(fileName);

			if (options.apiKey && !options.userApiKeyId) {
				const apiKey = await app.ms.database.getApiKeyByHash(uuidAPIKey.toUUID(options.apiKey));
				log('apiKey');
				if(!apiKey) {
					throw new Error("not_authorized");
				}
				options.userApiKeyId = apiKey.id;
			}

			if (dataToSave._bufs) {
				dataToSave = dataToSave._bufs[0];
			}

			if (dataToSave.type === "Buffer") {
				dataToSave = Buffer.from(dataToSave.data);
			}

			if (isArray(dataToSave) || isTypedArray(dataToSave)) {
				dataToSave = Buffer.from(dataToSave);
			}

			if (isNumber(dataToSave)) {
				dataToSave = dataToSave.toString(10);
			}

			let fileStream;
			if (isString(dataToSave) || isBuffer(dataToSave)) {
				fileStream = new Readable();
				fileStream._read = () => {};
				fileStream.push(dataToSave);
				fileStream.push(null);
			} else {
				fileStream = dataToSave;
			}

			const {resultFile: storageFile, resultMimeType: mimeType, resultExtension: extension, resultProperties} = await this.saveFileByStream(userId, fileStream, options.mimeType || mime.lookup(fileName) || extensionFromName, {
				extension: extensionFromName,
				driver: options.driver,
				onProgress: options.onProgress,
				waitForPin: options.waitForPin
			}).catch(e => {
				dataToSave.emit && dataToSave.emit('end');
				dataToSave.destroy && dataToSave.destroy();
				throw e;
			});
			log('saveFileByStream extension', extension, 'mimeType', mimeType);

			let existsContent = await app.ms.database.getContentByStorageAndUserId(storageFile.id, userId);
			log('existsContent', !!existsContent);
			if (existsContent) {
				console.log(`Content ${storageFile.id} already exists in database, check preview and folder placement`);
				await this.updateExistsContentMetadata(userId, existsContent, options);
				await app.callHook('content', 'existsContentAdding', [userId, existsContent, options]);
				return existsContent;
			}

			log('this.addContentWithPreview(storageFile, {resultProperties', resultProperties);
			return this.addContentWithPreview(userId, storageFile, {
				extension,
				mimeType,
				storageType: ContentStorageType.IPFS,
				view: options.view || ContentView.Contents,
				storageId: storageFile.id,
				size: storageFile.size,
				name: fileName,
				propertiesJson: JSON.stringify(merge(resultProperties || {}, options.properties || {}))
			}, options);
		}

		async saveDataByUrl(userId: number, url, options: { driver?, apiKey?, userApiKeyId?, folderId?, mimeType?, name?, description?, view?, path?, onProgress? } = {}) {
			await app.checkUserCan(userId, CorePermissionName.UserSaveData);
			let {name, description, view} = options;
			if (!name) {
				if (options.path) {
					name = commonHelper.getFilenameFromPath(options.path);
				} else {
					name = last(url.split('/'))
				}
			}
			let extension = commonHelper.getExtensionFromName(options.path || url);
			let type, properties;

			if (options.apiKey && !options.userApiKeyId) {
				const apiKey = await app.ms.database.getApiKeyByHash(uuidAPIKey.toUUID(options.apiKey));
				if(!apiKey) {
					throw new Error("not_authorized");
				}
				options.userApiKeyId = apiKey.id;
			}

			let storageFile;
			const uploadDriver = options.driver && app.ms.drivers.upload[options.driver] as AbstractDriver;
			if (uploadDriver && uploadDriver.isInputSupported(DriverInput.Source)) {
				const dataToSave = await this.handleSourceByUploadDriver(url, options.driver);
				type = dataToSave.type;
				const {resultFile, resultMimeType, resultExtension, resultProperties} = await this.saveFileByStream(userId, dataToSave.stream, type, {
					extension,
					onProgress: options.onProgress
				});
				type = resultMimeType;
				storageFile = resultFile;
				extension = resultExtension;
				properties = resultProperties;
			} else {
				const {resultFile, resultMimeType, resultExtension, resultProperties} = await axios({
					url,
					method: 'get',
					responseType: 'stream'
				}).then((response) => {
					const {status, statusText, data, headers} = response;
					if (status !== 200) {
						throw statusText;
					}
					return this.saveFileByStream(userId, data, headers['content-type'] || mime.lookup(name) || extension, {extension, driver: options.driver});
				});
				type = resultMimeType;
				storageFile = resultFile;
				extension = resultExtension;
				properties = resultProperties;
			}

			const existsContent = await app.ms.database.getContentByStorageAndUserId(storageFile.id, userId);
			if (existsContent) {
				await this.updateExistsContentMetadata(userId, existsContent, options);
				await app.callHook('content', 'existsContentAdding', [userId, existsContent, options]);
				return existsContent;
			}

			return this.addContentWithPreview(userId, storageFile, {
				name,
				description,
				extension,
				storageType: ContentStorageType.IPFS,
				mimeType: type,
				view: view || ContentView.Attachment,
				storageId: storageFile.id,
				size: storageFile.size,
				propertiesJson: JSON.stringify(properties)
			}, options, url);
		}

		async addContentWithPreview(userId: number, storageFile: IStorageFile, contentData, options, source?) {
			console.log('addContentWithPreview');
			let previewData = {};
			console.log('options.previews', options.previews);
			if (options.previews) {
				await pIteration.forEachSeries(options.previews, async (p: any) => {
					const result = await this.saveFileByStream(userId, p.content, p.mimeType, {waitForPin: options.waitForPin});
					console.log('result', result);
					previewData[p.previewSize + 'PreviewStorageId'] = result.resultFile.id;
					previewData[p.previewSize + 'PreviewSize'] = result.resultFile.size;
					//TODO: separate previews types
					previewData['previewMimeType'] = result.resultMimeType;
					previewData['previewExtension'] = result.resultExtension;
				});
				console.log('previewData', previewData);
			} else {
				const {
					storageFile: forPreviewStorageFile,
					extension: forPreviewExtension,
					fullType: forPreviewFullType,
					properties
				} = await this.prepareStorageFileAndGetPreview(storageFile, contentData.extension, contentData.mimeType);
				console.log('getPreview');
				previewData = await this.getPreview(forPreviewStorageFile, forPreviewExtension, forPreviewFullType, source);
				if (properties) {
					contentData.propertiesJson = JSON.stringify(properties);
				}
			}

			if (storageFile.emitFinish) {
				storageFile.emitFinish();
				storageFile.emitFinish = null;
			}

			return this.addContent(userId, {
				...contentData,
				...previewData
			}, options);
		}

		async saveDirectoryToStorage(userId: number, dirPath, options: { userApiKeyId? } = {}) {
			const resultFile = await app.ms.storage.saveDirectory(dirPath);
			return this.addContentWithPreview(userId, resultFile, {
				extension: 'none',
				mimeType: 'directory',
				storageType: ContentStorageType.IPFS,
				view: ContentView.Contents,
				storageId: resultFile.id,
				size: getDirSize(dirPath),
			}, options);
		}

		private async saveFileByStream(userId: number, stream, mimeType, options: any = {}): Promise<any> {
			return new Promise(async (resolve, reject) => {
				let extension = (options.extension || last(mimeType.split('/')) || '').toLowerCase();

				let properties;
				if (commonHelper.isVideoType(mimeType)) {
					log('videoToStreamable processByStream');
					const convertResult = await app.ms.drivers.convert['videoToStreamable'].processByStream(stream, {
						extension: extension,
						onProgress: options.onProgress,
						onError: reject
					});
					stream = convertResult.stream;
					extension = convertResult.extension;
					mimeType = convertResult.type;
					properties =  {duration: convertResult['duration'] };
				}

				if (options.watermark) {
					const watermarkResult = await app.ms.drivers.convert['imageWatermark'].processByStream(stream, options.watermark);
					stream = watermarkResult.stream;
				}

				const sizeRemained = await app.getUserLimitRemained(userId, UserLimitName.SaveContentSize);

				if (sizeRemained !== null) {
					log('sizeRemained', sizeRemained);
					if(sizeRemained < 0) {
						return reject("limit_reached");
					}
					console.log('sizeRemained', sizeRemained);
					let streamSize = 0;
					const sizeCheckStream = new Transform({
						transform: function (chunk, encoding, callback) {
							streamSize += chunk.length;
							console.log('streamSize', streamSize);
							if (streamSize >= sizeRemained) {
								console.error("limit_reached for user", userId);
								// callback("limit_reached", null);
								reject("limit_reached");
								// stream.emit('error', "limit_reached");
								stream.end();
								sizeCheckStream.end();
							} else {
								callback(null, chunk);
							}
						}
					});
					sizeCheckStream.on('error', reject);

					stream = stream.pipe(sizeCheckStream);
				}
				const storageOptions = {
					waitForPin: options.waitForPin
				};
				log('options.driver', options.driver, 'storageOptions', storageOptions);

				let resultFile: IStorageFile;
				await Promise.all([
					(async () => {
						if (options.driver === 'archive') {
							log('upload archive processByStream');
							const uploadResult = await app.ms.drivers.upload['archive'].processByStream(stream, {
								extension,
								onProgress: options.onProgress,
								onError: reject
							});
							if (!uploadResult) {
								return; // onError handled
							}
							console.log('saveDirectory', uploadResult['tempPath'] + '/');
							resultFile = await app.ms.storage.saveDirectory(uploadResult['tempPath'] + '/', storageOptions);
							if (uploadResult['emitFinish']) {
								uploadResult['emitFinish']();
							}
							mimeType = 'directory';
							extension = 'none';
							console.log('uploadResult', uploadResult);
							resultFile.size = uploadResult['size'];
						} else {
							log('app.ms.storage.isStreamAddSupport()', app.ms.storage.isStreamAddSupport());
							if (app.ms.storage.isStreamAddSupport()) {
								resultFile = await app.ms.storage.saveFileByData(stream, storageOptions);
							} else {
								const uploadResult = await app.ms.drivers.upload['file'].processByStream(stream, {
									extension,
									onProgress: options.onProgress,
									onError: reject
								});
								log('saveFileByPath(uploadResult.tempPath)', uploadResult['tempPath']);
								resultFile = await app.ms.storage.saveFileByPath(uploadResult['tempPath'], storageOptions);
								resultFile.tempPath = uploadResult['tempPath'];
								resultFile.emitFinish = uploadResult['emitFinish'];
							}
							// get actual size from fileStat. Sometimes resultFile.size is bigger than fileStat size
							delete resultFile.size;
						}
					})().catch(e => console.error('resultFile', e)),

					(async () => {
						console.log('mimeType', mimeType);
						if (startsWith(mimeType, 'image')) {
							properties = await app.ms.drivers.metadata['image'].processByStream(stream);
							// console.log('metadata processByStream', properties);
						}
					})()
				]);

				if (!resultFile.size) {
					const storageContentStat = await app.ms.storage.getFileStat(resultFile.id);
					log('getFileStat storageContentStat', storageContentStat);
					resultFile.size = storageContentStat.size;
					log('resultFile.size', resultFile.size);
				}

				resolve({
					resultFile: resultFile,
					resultMimeType: mimeType,
					resultExtension: extension,
					resultProperties: properties
				});
			});
		}

		async handleSourceByUploadDriver(sourceLink, driver) {
			const uploadDriver = app.ms.drivers.upload[driver] as AbstractDriver;
			if (!uploadDriver) {
				throw new Error(driver + "_upload_driver_not_found");
			}
			if (!uploadDriver.supportedInputs.includes(DriverInput.Source)) {
				throw new Error(driver + "_upload_driver_input_not_correct");
			}
			return uploadDriver.processBySource(sourceLink, {});
		}

		async createContentByRemoteStorageId(userId, manifestStorageId, options: { userApiKeyId? } = {}) {
			let dbContent = await app.ms.database.getContentByManifestId(manifestStorageId);
			if (dbContent) {
				return dbContent;
			}

			const contentObject: IContent = await app.ms.entityJsonManifest.manifestIdToDbObject(manifestStorageId, 'content');
			contentObject.isRemote = true;
			return this.createContentByObject(userId, manifestStorageId, options);
		}

		async createContentByObject(userId, contentObject, options?: { userApiKeyId? }) {
			const storageId = contentObject.manifestStaticStorageId || contentObject.manifestStorageId;
			const dbContent = await app.ms.database.getContentByStorageAndUserId(storageId, userId);
			if (dbContent) {
				return dbContent;
			}
			return this.addContent(userId, contentObject, options);
		}

		async getFileSize(dataPath, content) {
			let dataSize = content ? content.size : null;
			// if (!dataSize) {
			//   console.log('dataSize is null', dataPath, dataSize);
			//TODO: check if some size not correct
			const stat = await app.ms.storage.getFileStat(dataPath);
			dataSize = stat.size;
			return dataSize;
		}

		async getDataPath(dataPath) {
			dataPath = trimStart(dataPath, '/')
			console.log('dataPath', dataPath);

			let splitPath = dataPath.split('.');
			console.log('isFileCidHash', splitPath[0], ipfsHelper.isFileCidHash(splitPath[0]));
			if (ipfsHelper.isFileCidHash(splitPath[0])) {
				// cut extension, TODO: use regex
				dataPath = splitPath[0];
			}

			const cid = dataPath.split('/')[0];
			if (ipfsHelper.isAccountCidHash(cid)) {
				dataPath = dataPath.replace(cid, await app.ms.staticId.resolveStaticId(cid));
			}
			return dataPath;
		}

		async getFileStreamForApiRequest(req, res, dataPath) {
			app.ms.api.setStorageHeaders(res);

			console.log('getDataPath', dataPath);
			dataPath = await this.getDataPath(dataPath);
			console.log('dataPath', dataPath);

			let range = req.headers['range'];
			if (!range) {
				let content = await app.ms.database.getContentByStorageId(dataPath, false);
				if (!content && dataPath.split('/').length > 1) {
					console.log('getContentByStorageId', dataPath.split('/')[0]);
					content = await app.ms.database.getContentByStorageId(dataPath.split('/')[0], false);
				}
				console.log('content', content);
				if (content) {
					const contentType = content.storageId === dataPath ? content.mimeType : content.previewMimeType;
					console.log('contentType', contentType);
					if (contentType) {
						res.setHeader('Content-Type', contentType);
					}
					if (content.mimeType === ContentMimeType.Directory && !(last(dataPath.split('/')) as string).includes('.')) {
						dataPath += '/index.html';
					}
				} else if (dataPath.endsWith('.js')) {
					res.setHeader('Content-Type', 'text/javascript');
				}
				return this.getFileStream(dataPath).then((stream) => {
					stream.pipe(res.stream);
				});
			}

			console.log('getContentByStorageId', dataPath);
			const content = await this.getContentByStorageId(dataPath);
			if (content && content.mimeType === ContentMimeType.Directory) {
				// console.log('content.mimeType', dataPath, content.mimeType);
				dataPath += '/index.html';
			}
			const dataSize = await this.getFileSize(dataPath, content);
			if (content && (startsWith(content.mimeType, 'image/') || content.mimeType === ContentMimeType.Directory)) {
				res.writeHead(200, await this.getIpfsHashHeadersObj(content, dataPath, dataSize, false));
				return res.send(this.getFileStream(dataPath));
			}
			console.log('dataSize', dataSize);

			let chunkSize = 1024 * 1024;
			if(dataSize > chunkSize * 2) {
				chunkSize = Math.ceil(dataSize * 0.25);
			}

			range = range.replace(/bytes=/, "").split("-");

			range[0] = range[0] ? parseInt(range[0], 10) : 0;
			range[1] = range[1] ? parseInt(range[1], 10) : range[0] + chunkSize;
			if(range[1] > dataSize - 1) {
				range[1] = dataSize - 1;
			}
			range = {start: range[0], end: range[1]};

			const contentLength = range.end - range.start + 1;

			const fileStreamOptions = {
				offset: range.start,
				length: contentLength
			};

			return this.getFileStream(dataPath, fileStreamOptions).then((stream) => {
				//
				let resultLength = 0;
				stream.on('data', (data) => {
					resultLength += data.length;
				});
				stream.on('end', (data) => {
					console.log('range.start', range.start);
					console.log('contentLength', contentLength);
					console.log('resultLength ', resultLength);
					console.log(range.start + contentLength, '/', dataSize);
					console.log(range.start + resultLength, '/', dataSize);
				});

				let mimeType = '';
				if(content) {
					mimeType = content.storageId === dataPath ? content.mimeType : content.previewMimeType;
				}
				res.writeHead(206, {
					// 'Cache-Control': 'no-cache, no-store, must-revalidate',
					// 'Pragma': 'no-cache',
					// 'Expires': 0,
					'Cross-Origin-Resource-Policy': 'cross-origin',
					'Content-Type': mimeType,
					'Accept-Ranges': 'bytes',
					'Content-Range': 'bytes ' + range.start + '-' + range.end + '/' + dataSize,
					'Content-Length': contentLength
				});
				stream.pipe(res.stream);
			});
		}

		async getContentHead(req, res, hash) {
			app.ms.api.setDefaultHeaders(res);
			const dataPath = await this.getDataPath(hash);
			const content = await app.ms.database.getContentByStorageId(dataPath, true);
			if (content) {
				const headersObj = await this.getIpfsHashHeadersObj(content, dataPath, null, true);
				Object.keys(headersObj).map(key => {
					res.setHeader(key, headersObj[key]);
				})
			}
			res.send(200);
		}

		async getIpfsHashHeadersObj(content, dataPath, dataSize?, preview?) {
			if (!dataSize) {
				dataSize = await this.getFileSize(dataPath, content);
			}
			return {
				'Accept-Ranges': 'bytes',
				'Cross-Origin-Resource-Policy': 'cross-origin',
				'Content-Type': content.storageId !== dataPath && preview ? content.previewMimeType : content.mimeType,
				'Content-Length': dataSize,
				'cache-control': 'public, max-age=29030400, immutable',
				'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
				'x-ipfs-path': dataPath,
				'x-ipfs-roots': last(dataPath.split('/')),
				'x-ipfs-gateway-host': 'ipfs-bank12-am6', // TODO: get this values from ipfs node
				'x-ipfs-pop': 'ipfs-bank12-am6',
				'x-ipfs-lb-pop': 'gateway-bank2-am6',
				'x-proxy-cache': 'MISS',
				'x-ipfs-datasize': dataSize,
				'timing-allow-origin': '*'
			}
		}
	}

	return new ContentModule();
}

interface IStorageFile {
	size,
	id,
	tempPath?,
	emitFinish?
}