import { Sequelize, DataTypes, Model } from 'sequelize';

interface UserAttributes {
  title: string;
  tgId: string;
  photoSize: number;
  contentLimit: number;
}

class User extends Model<UserAttributes> implements UserAttributes {
  public title!: string;
  public tgId!: string;
  public photoSize!: number;
  public contentLimit!: number;
}

interface DescriptionAttributes {
  tgId: string;
  contentId: string | null;
  ipfsContent: string | null;
  text: string | null;
  aitext: string | null;
}

class Description extends Model<DescriptionAttributes> implements DescriptionAttributes {
  public tgId!: string;
  public contentId!: string | null;
  public ipfsContent!: string | null;
  public text!: string | null;
  public aitext!: string | null;
}

export default async function setupModels(sequelize: Sequelize) {
  sequelize.define<User>('user', {
    title: {
      type: DataTypes.STRING(100),
    },
    tgId: {
      type: DataTypes.STRING(100),
    },
    photoSize: {
      type: DataTypes.FLOAT(),
      defaultValue: 0,
    },
    contentLimit: {
      type: DataTypes.FLOAT(),
      defaultValue: 100,
    },
  });

  sequelize.define<Description>('description', {
    tgId: {
      type: DataTypes.STRING(100),
    },
    contentId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    ipfsContent: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    text: {
      type: DataTypes.TEXT(),
      allowNull: true,
    },
    aitext: {
      type: DataTypes.TEXT(),
      allowNull: true,
    },
  }, {
    timestamps: false,
  });

  await sequelize.sync();

  const models = {
    User,
    Description,
  };

  return models;
}
