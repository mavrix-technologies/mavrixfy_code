module.exports = {
  exclude: [
    "android/**",
    "ios/**",
    "node_modules/**",
    ".expo/**",
    "dist/**",
    "web-build/**",
  ],
  rules: {
    "react-doctor/no-high-complexity-react-function": "off",
    "react-doctor/duplicate-jsx-subtree": "off",
  },
  maxDuration: 15,
};
