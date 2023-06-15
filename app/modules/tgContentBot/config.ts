import includes from 'lodash/includes';

const options = {
  logging: (d: string) => {
    if (includes(d, 'FROM `offers`') || includes(d, 'PRAGMA INDEX') || includes(d, 'FROM sqlite_master')) {
      return;
    }
    console.log(d);
  },
  dialect: 'sqlite',
  storage: 'database.sqlite',
};

export default {
  options,
};
