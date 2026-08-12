class SearchProvider {
  async search() {
    throw new Error('SearchProvider.search must be implemented');
  }
}

module.exports = {
  SearchProvider
};
