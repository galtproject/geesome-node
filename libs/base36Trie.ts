const base36 = require('./base36');
const trie = require('./trie');

const base36TrieLib = {
  setNode(tree, id, node) {
    id = base36.encode(id);
    trie.setNode(tree, id, node);
  },

  getNode(tree, id) {
    id = base36.encode(id);
    return trie.getNode(tree, id);
  },

  getTreePath: trie.getTreePath
};

module.exports = base36TrieLib;
