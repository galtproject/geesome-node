/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */
import {DataTypes, Op, Sequelize} from "sequelize";

export default async function (sequelize: Sequelize, models) {
  const schemaState = await getStorageObjectIdentitySchemaState(sequelize);
  const includeIdentityColumns = !schemaState.tableExists || schemaState.hasIdentityColumns;
	const includeSha256Column = !schemaState.tableExists || schemaState.hasSha256Column;

  const StorageObject = sequelize.define('storageObject', getStorageObjectAttributes(includeIdentityColumns, includeSha256Column), {
    indexes: getStorageObjectIndexes(includeIdentityColumns, includeSha256Column)
  } as any);

  return StorageObject.sync({});
};

function getStorageObjectAttributes(includeIdentityColumns: boolean, includeSha256Column: boolean) {
  const attributes = {
    storageId: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    storageType: {
      type: DataTypes.STRING(200)
    },
    mimeType: {
      type: DataTypes.STRING(200)
    },
    extension: {
      type: DataTypes.STRING(200)
    },
    size: {
      type: DataTypes.BIGINT
    },
    largePreviewStorageId: {
      type: DataTypes.STRING(200)
    },
    largePreviewSize: {
      type: DataTypes.BIGINT
    },
    mediumPreviewStorageId: {
      type: DataTypes.STRING(200)
    },
    mediumPreviewSize: {
      type: DataTypes.BIGINT
    },
    smallPreviewStorageId: {
      type: DataTypes.STRING(200)
    },
    smallPreviewSize: {
      type: DataTypes.BIGINT
    },
    previewMimeType: {
      type: DataTypes.STRING(200)
    },
    previewExtension: {
      type: DataTypes.STRING(200)
    },
    isPinned: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }
  } as any;

	if (includeSha256Column) {
		attributes.sha256 = {type: DataTypes.STRING(64)};
	}

  if (includeIdentityColumns) {
    attributes.identityType = {
      type: DataTypes.STRING(80)
    };
    attributes.identityId = {
      type: DataTypes.STRING(500)
    };
    attributes.identityUrl = {
      type: DataTypes.TEXT
    };
    attributes.identityUpdatedAt = {
      type: DataTypes.DATE
    };
  }

  return attributes;
}

function getStorageObjectIndexes(includeIdentityIndex: boolean, includeSha256Index: boolean) {
  const indexes: any[] = [
    { name: 'storage_objects_storage_id_unique', fields: ['storageId'], unique: true },
    { name: 'storage_objects_large_preview_storage_idx', fields: ['largePreviewStorageId'] },
    { name: 'storage_objects_medium_preview_storage_idx', fields: ['mediumPreviewStorageId'] },
    { name: 'storage_objects_small_preview_storage_idx', fields: ['smallPreviewStorageId'] },
		{ name: 'storage_objects_updated_idx', fields: ['updatedAt', 'id'] }
  ];
	if (includeSha256Index) {
		indexes.push({name: 'storage_objects_sha256_idx', fields: ['sha256', 'id']});
	}

  if (includeIdentityIndex) {
    indexes.push({
      name: 'storage_objects_identity_idx',
      fields: ['identityType', 'identityId'],
      where: {
        identityType: {[Op.ne]: null},
        identityId: {[Op.ne]: null}
      }
    });
  }

  return indexes;
}

async function getStorageObjectIdentitySchemaState(sequelize: Sequelize) {
  const [rows] = await sequelize.query(`
    SELECT
      to_regclass('"storageObjects"') IS NOT NULL AS "tableExists",
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'storageObjects'
          AND column_name = 'identityType'
      ) AS "hasIdentityType",
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'storageObjects'
          AND column_name = 'identityId'
      ) AS "hasIdentityId"
			, EXISTS (
				SELECT 1
				FROM information_schema.columns
				WHERE table_schema = 'public'
					AND table_name = 'storageObjects'
					AND column_name = 'sha256'
			) AS "hasSha256"
  `);
  const row = (rows as any[])[0] || {};
  return {
    tableExists: row.tableExists === true,
    hasIdentityColumns: row.hasIdentityType === true && row.hasIdentityId === true,
		hasSha256Column: row.hasSha256 === true,
  };
}
