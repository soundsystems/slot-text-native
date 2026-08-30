module.exports = (api) => {
  api.cache(true);

  return {
    plugins: ["react-native-worklets/plugin"],
    presets: ["babel-preset-expo"],
  };
};
