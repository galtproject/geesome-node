if (process.env.GEESOME_TEST_LOGS !== '1') {
  console.log = () => {};
}
