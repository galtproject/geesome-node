import {DataTypes} from 'sequelize';

export default async function (sequelize) {
    const Rendition = sequelize.define('imageRendition', {
        id: {type: DataTypes.UUID, primaryKey: true}, userId: {type: DataTypes.INTEGER, allowNull: false},
        sourceContentId: {type: DataTypes.INTEGER, allowNull: false},
        sourceStorageId: {type: DataTypes.STRING(100), allowNull: false},
        sourceManifestId: DataTypes.STRING(100), rootSourceStorageId: DataTypes.STRING(100),
        policy: {type: DataTypes.STRING(100), allowNull: false},
        contentId: DataTypes.INTEGER, result: DataTypes.JSONB, source: DataTypes.JSONB,
        queueId: DataTypes.INTEGER,
    }, {indexes: [{fields: ['userId', 'sourceStorageId', 'policy'], unique: true}, {fields: ['userId', 'contentId']}]});
    const Reference = sequelize.define('imageOptimizationReference', {
        id: {type: DataTypes.UUID, primaryKey: true},
        ownerId: {type: DataTypes.INTEGER, allowNull: false},
        scope: {type: DataTypes.STRING(100), allowNull: false},
        storageId: {type: DataTypes.STRING(100), allowNull: false},
    }, {indexes: [{fields: ['scope', 'storageId'], unique: true}, {fields: ['storageId']}]});
    const Replacement = sequelize.define('imageReplacement', {
        id: {type: DataTypes.UUID, primaryKey: true}, userId: {type: DataTypes.INTEGER, allowNull: false},
        requestKey: {type: DataTypes.STRING(200), allowNull: false}, apiKeyId: DataTypes.INTEGER,
        requestHash: {type: DataTypes.STRING(64), allowNull: false},
        input: {type: DataTypes.JSONB, allowNull: false}, result: DataTypes.JSONB,
        status: {type: DataTypes.STRING(60), allowNull: false}, error: DataTypes.TEXT,
    }, {indexes: [{fields: ['userId', 'requestKey'], unique: true}, {fields: ['status', 'createdAt']}]});
    const Revision = sequelize.define('imageSiteRevision', {
        id: {type: DataTypes.UUID, primaryKey: true}, userId: {type: DataTypes.INTEGER, allowNull: false},
        staticSiteId: {type: DataTypes.INTEGER, allowNull: false},
        replacementId: DataTypes.UUID, storageId: DataTypes.STRING(100),
        workPath: {type: DataTypes.STRING(200), allowNull: false}, retiredAt: DataTypes.DATE,
    }, {indexes: [{fields: ['storageId']}, {fields: ['workPath'], unique: true}, {fields: ['replacementId']}]});
    const RetiredStorage = sequelize.define('retiredStorage', {
        storageId: {type: DataTypes.STRING(100), primaryKey: true},
        replacementId: {type: DataTypes.UUID, allowNull: false},
    });
    for (const model of [Rendition, Reference, Replacement, Revision, RetiredStorage]) {
        await model.sync({});
    }
    return {Rendition, Reference, Replacement, Revision, RetiredStorage};
}
