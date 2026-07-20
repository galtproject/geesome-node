import {DataTypes, Sequelize} from 'sequelize';

export const ImageCompositionOperationState = Object.freeze({
  Pending: 'pending',
  Succeeded: 'succeeded',
  Failed: 'failed'
} as const);

export default async function (sequelize: Sequelize, models) {
  const ImageCompositionOperation = sequelize.define('imageCompositionOperation', {
    actorUserId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    operationKind: {
      type: DataTypes.STRING(32),
      allowNull: false
    },
    targetKey: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    idempotencyKey: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    requestHash: {
      type: DataTypes.STRING(71),
      allowNull: false
    },
    state: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: ImageCompositionOperationState.Pending
    },
    claimToken: {
      type: DataTypes.STRING(100)
    },
    claimExpiresAt: {
      type: DataTypes.DATE
    },
    attemptCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    resultPostId: {
      type: DataTypes.INTEGER
    },
    resultRevision: {
      type: DataTypes.INTEGER
    },
    resultJson: {
      type: DataTypes.TEXT
    },
    recoveryJson: {
      type: DataTypes.TEXT
    },
    errorCode: {
      type: DataTypes.STRING(100)
    },
    failedAt: {
      type: DataTypes.DATE
    },
    succeededAt: {
      type: DataTypes.DATE
    }
  } as any, {
    indexes: [
      {
        name: 'image_composition_operations_identity_unique',
        fields: ['actorUserId', 'operationKind', 'targetKey', 'idempotencyKey'],
        unique: true
      },
      {
        name: 'image_composition_operations_pending_claim_idx',
        fields: ['state', 'claimExpiresAt', 'id']
      },
      {
        name: 'image_composition_operations_result_post_idx',
        fields: ['resultPostId', 'id']
      }
    ]
  } as any);

  models.ImageCompositionOperation = ImageCompositionOperation;
  return ImageCompositionOperation.sync({});
}
