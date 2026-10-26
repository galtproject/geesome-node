import { DataTypes } from 'sequelize';
import { defineBrowserSessions } from '../api/browserSession.js';
export default async function (sequelize) {
  const Identity = sequelize.define('loginIdentity', {
    id: { type: DataTypes.UUID, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    provider: { type: DataTypes.STRING(30), allowNull: false },
    subject: { type: DataTypes.STRING(200), allowNull: false },
    email: { type: DataTypes.STRING(320), allowNull: false },
    name: { type: DataTypes.STRING(200), allowNull: false }
  }, { indexes: [{ fields: ['provider', 'subject'], unique: true }, { fields: ['userId'] }] });
  const Challenge = sequelize.define('loginChallenge', {
    id: { type: DataTypes.UUID, primaryKey: true },
    siteId: { type: DataTypes.STRING(30), allowNull: false },
    tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    nonceHash: { type: DataTypes.STRING(64), allowNull: false },
    expiresAt: { type: DataTypes.DATE, allowNull: false }
  }, { indexes: [{ fields: ['expiresAt'] }] });
  (Identity as any).lockSubject = (subject, transaction) => sequelize.query('SELECT pg_advisory_xact_lock(hashtextextended(:identity, 0))', { replacements: { identity: `google:${subject}` }, transaction });
  await Identity.sync({});
  await Challenge.sync({});
  return { Identity, Challenge, Session: await defineBrowserSessions(sequelize) };
}
