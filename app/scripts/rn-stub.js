// react-native shim so the pure-logic checks can run under plain Node.
const noop = () => null;
module.exports = new Proxy({}, { get: () => noop });
